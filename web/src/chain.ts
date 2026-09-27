import { decodeFunctionData, encodeFunctionData, createWalletClient, custom, type Abi, type Address, type Hex } from 'viem';
import { type Config, type Reader, type Provider } from './config';
import { assertWallet, message } from './wallet';

export async function verifyDeployment(c: Config, rpc: Reader) {
  if (await rpc.getChainId() !== c.manifest.chainId) throw Error('RPC is on the wrong network. Transactions are disabled.');
  await Promise.all([...c.manifest.contracts, ...(['poolManager', 'positionManager', 'stateView', 'permit2'] as const).map(name => ({ name, address: c.addresses[name] }))].map(async x => {
    const code = await rpc.getCode({ address: x.address });
    if (!code || code === '0x') throw Error(`${x.name} has no deployed code. Transactions are disabled.`);
  }));
  const bindings = await Promise.all([
    rpc.readContract({ address: c.hook.address, abi: c.hook.abi, functionName: 'poolManager' }),
    rpc.readContract({ address: c.addresses.positionManager, abi: c.abis.PositionManager, functionName: 'poolManager' }),
    rpc.readContract({ address: c.addresses.stateView, abi: c.abis.StateView, functionName: 'poolManager' }),
    rpc.readContract({ address: c.addresses.positionManager, abi: c.abis.PositionManager, functionName: 'permit2' }),
  ]);
  if (bindings.some((address, i) => String(address).toLowerCase() !== (i === 3 ? c.addresses.permit2 : c.addresses.poolManager).toLowerCase())) throw Error('Contract binding mismatch. Transactions are disabled.');
}

export interface PositionRow { key: Hex; staked: bigint; earned: bigint; liquidity: bigint; beneficiary: Address }
export interface Snapshot {
  block: bigint; timestamp: bigint; fetchedAt: number; decimals: number; symbol: string;
  rate: bigint; end: bigint; totalStaked: bigint; idle: bigint; remaining: bigint;
  sqrtPrice: bigint; tick: number; poolLiquidity: bigint;
  balance: bigint; nativeBalance: bigint; hookAllowance: bigint; tokenAllowance: bigint;
  permitAmount: bigint; permitExpiration: number;
  positions: PositionRow[]; positionCount: bigint;
}
export async function readSnapshot(c: Config, rpc: Reader, account?: Address, page = 0): Promise<Snapshot> {
  const block = await rpc.getBlock();
  if (block.number === null) throw Error('No confirmed block available');
  const at = { blockNumber: block.number };
  const readHook = (functionName: string, args: readonly unknown[] = [c.poolId]) => rpc.readContract({ address: c.hook.address, abi: c.hook.abi, functionName, args, ...at });
  const readToken = (functionName: string, args?: readonly unknown[]) => rpc.readContract({ address: c.token.address, abi: c.token.abi, functionName, args, ...at });
  const [decimals, symbol, rate, end, totalStaked, idle, remaining, slot, poolLiquidity, balance, nativeBalance, hookAllowance, tokenAllowance, permit, count] = await Promise.all([
    readToken('decimals'), readToken('symbol'), readHook('rewardRate'), readHook('periodEnd'), readHook('totalStaked'), readHook('idle'), readHook('unstreamed'),
    rpc.readContract({ address: c.addresses.stateView, abi: c.abis.StateView, functionName: 'getSlot0', args: [c.poolId], ...at }),
    rpc.readContract({ address: c.addresses.stateView, abi: c.abis.StateView, functionName: 'getLiquidity', args: [c.poolId], ...at }),
    account ? readToken('balanceOf', [account]) : 0n,
    account ? rpc.getBalance({ address: account, ...at }) : 0n,
    account ? readToken('allowance', [account, c.hook.address]) : 0n,
    account ? readToken('allowance', [account, c.addresses.permit2]) : 0n,
    account ? rpc.readContract({ address: c.addresses.permit2, abi: c.abis.Permit2, functionName: 'allowance', args: [account, c.token.address, c.addresses.positionManager], ...at }) : [0n, 0, 0],
    account ? readHook('positionCount', [account]) : 0n,
  ]);
  if (Number(decimals) !== c.manifest.token.decimals || symbol !== c.manifest.token.symbol) throw Error('Deployed token metadata differs from the handoff. Transactions are disabled.');
  const positionCount = count as bigint;
  const start = BigInt(page * 10);
  const pageSize = positionCount > start ? Number(positionCount - start > 10n ? 10n : positionCount - start) : 0;
  const refs = await Promise.all(Array.from({ length: pageSize }, (_, i) => readHook('positionAt', [account, start + BigInt(i)]))) as { poolId: Hex; positionKey: Hex }[];
  const positions = await Promise.all(refs.filter(r => r.poolId.toLowerCase() === c.poolId.toLowerCase()).map(async r => {
    const [staked, earned, beneficiary, info] = await Promise.all([
      readHook('staked', [c.poolId, r.positionKey]), readHook('earned', [c.poolId, r.positionKey]), readHook('beneficiaryOf', [c.poolId, r.positionKey]),
      rpc.readContract({ address: c.addresses.stateView, abi: c.abis.StateView, functionName: 'getPositionInfo', args: [c.poolId, r.positionKey], ...at }),
    ]);
    return { key: r.positionKey, staked: staked as bigint, earned: earned as bigint, beneficiary: beneficiary as Address, liquidity: (info as [bigint, bigint, bigint])[0] };
  }));
  const [sqrtPrice, tick] = slot as [bigint, number, number, number];
  const [permitAmount, permitExpiration] = permit as [bigint, number, number];
  return { block: block.number, timestamp: block.timestamp, fetchedAt: Date.now(), decimals: Number(decimals), symbol: String(symbol),
    rate: rate as bigint, end: end as bigint, totalStaked: totalStaked as bigint, idle: idle as bigint, remaining: remaining as bigint,
    sqrtPrice, tick, poolLiquidity: poolLiquidity as bigint, balance: balance as bigint, nativeBalance: nativeBalance as bigint,
    hookAllowance: hookAllowance as bigint, tokenAllowance: tokenAllowance as bigint, permitAmount, permitExpiration, positions, positionCount };
}
export interface Activity { event: string; hash: Hex; block: bigint; index: number; amount?: bigint }
export async function readActivity(c: Config, rpc: Reader, head: bigint) {
  const from = head - 1999n > BigInt(c.manifest.deploymentBlock) ? head - 1999n : BigInt(c.manifest.deploymentBlock);
  if (from > head) return [];
  const logs = await rpc.getLogs({ address: c.hook.address, events: c.hook.abi.filter(x => x.type === 'event'), fromBlock: from, toBlock: head });
  return logs.filter(l => (l.args as { poolId?: string }).poolId?.toLowerCase() === c.poolId.toLowerCase()).map(l => {
    const args = l.args as { received?: bigint; amount?: bigint; liquidity?: bigint };
    return { event: l.eventName ?? 'Hook event', hash: l.transactionHash!, block: l.blockNumber!, index: l.logIndex!, amount: args.received ?? args.amount ?? args.liquidity };
  }).reverse().slice(0, 8);
}
export interface Transaction { to: Address; abi: Abi; data: Hex; value?: bigint }
export function contractTx(to: Address, abi: Abi, functionName: string, args: readonly unknown[]): Transaction {
  return { to, abi, data: encodeFunctionData({ abi, functionName, args }) };
}
export async function sendTransaction(c: Config, rpc: Reader, provider: Provider, account: Address, tx: Transaction,
  status: (text: string, hash?: Hex) => void, valid: () => boolean = () => true) {
  const check = async () => {
    if (!valid()) throw Error('Wallet or form changed. Review the page and try again.');
    await assertWallet(provider, account, c.manifest.chainId);
  };
  await check();
  status('Checking deployment and simulating…');
  await verifyDeployment(c, rpc);
  const decoded = decodeFunctionData({ abi: tx.abi, data: tx.data });
  await rpc.simulateContract({ address: tx.to, abi: tx.abi, functionName: decoded.functionName, args: decoded.args, account, value: tx.value ?? 0n });
  await check();
  status('Confirm this transaction in your wallet.');
  const wallet = createWalletClient({ chain: c.chain, transport: custom(provider), account });
  const hash = await wallet.sendTransaction({ to: tx.to, data: tx.data, value: tx.value ?? 0n });
  status('Transaction submitted. Waiting for confirmation…', hash);
  try {
    let replacedByDifferentAction = false;
    const receipt = await rpc.waitForTransactionReceipt({ hash, timeout: 180_000, onReplaced: ({ transaction, reason }) => {
      if (reason !== 'repriced') replacedByDifferentAction = true;
      status('Replacement transaction submitted. Waiting for confirmation…', transaction.hash);
    } });
    if (replacedByDifferentAction) throw Error('The transaction was cancelled or replaced with another action. Review its explorer record.');
    if (receipt.status !== 'success') throw Error('Transaction reverted onchain. No action completed; refresh and review before retrying.');
    status('Transaction confirmed. Refreshing balances and rewards…', receipt.transactionHash);
    return receipt;
  } catch (error) {
    throw Error(`${message(error)} Check the transaction in the explorer before retrying.`);
  }
}
