import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeAbiParameters, decodeFunctionData, encodeAbiParameters, type Hex } from 'viem';
import { amountInput, buildMint } from '../src/mint';
import { poolKeyType, canonical, relativeAsset, type Provider, type Reader } from '../src/config';
import { switchChain, assertWallet } from '../src/wallet';
import { sendTransaction, contractTx } from '../src/chain';
import { config, account, snapshot } from './fixtures';

export function decodeMint(data: Hex) {
  let decoded = decodeFunctionData({ abi: config.abis.PositionManager, data });
  if (decoded.functionName === 'multicall') {
    const calls = decoded.args![0] as Hex[];
    assert.equal(calls.length, 1, 'Only the mint operation is wrapped');
    decoded = decodeFunctionData({ abi: config.abis.PositionManager, data: calls[0] });
  }
  assert.equal(decoded.functionName, 'modifyLiquidities');
  const [actions, parameters] = decodeAbiParameters([{ type: 'bytes' }, { type: 'bytes[]' }], decoded.args![0] as Hex);
  assert.equal(actions, '0x020d14', 'MINT_POSITION / SETTLE_PAIR / SWEEP');
  const mint = decodeAbiParameters([poolKeyType, { type: 'int24' }, { type: 'int24' }, { type: 'uint256' }, { type: 'uint128' }, { type: 'uint128' }, { type: 'address' }, { type: 'bytes' }], parameters[0]);
  assert.deepEqual(mint[0], { ...config.poolKey, currency1: mint[0].currency1, hooks: mint[0].hooks });
  assert.equal(mint[0].currency1.toLowerCase(), config.token.address);
  assert.equal(mint[0].hooks.toLowerCase(), config.hook.address);
  assert.equal(mint[1], -887220); assert.equal(mint[2], 887220);
  assert.equal(mint[6].toLowerCase(), account);
  assert.equal(mint[7], encodeAbiParameters([{ type: 'address' }], [account]));
  const settle = decodeAbiParameters([{ type: 'address' }, { type: 'address' }], parameters[1]);
  assert.equal(settle[0].toLowerCase(), config.poolKey.currency0); assert.equal(settle[1].toLowerCase(), config.token.address);
  const sweep = decodeAbiParameters([{ type: 'address' }, { type: 'address' }], parameters[2]);
  assert.equal(BigInt(sweep[0]), 0n); assert.equal(BigInt(sweep[1]), 1n, 'SDK MSG_SENDER returns excess ETH to the sender');
  return { mint, deadline: decoded.args![1] as bigint };
}
test('strict amounts reject precision loss, exponents, signs and zero mint budgets', () => {
  for (const v of ['', '-1', '+1', '1e3', '.1', '1.0000001', '0']) assert.throws(() => amountInput(v, 6));
  assert.equal(amountInput('1.234567', 6), 1234567n);
  assert.equal(amountInput('0', 18, true), 0n);
});
test('SDK mint has fixed range, exact wallet beneficiary, bounded spends and native refund', () => {
  const result = buildMint(config, snapshot, account, '0.01', '0.01', 50, 1000);
  const decoded = decodeMint(result.data);
  assert.equal(decoded.mint[4], result.max0); assert.equal(decoded.mint[5], result.max1);
  assert(result.max0 <= 10n ** 16n && result.max1 <= 10n ** 16n);
  assert.equal(result.value, result.max0); assert.equal(decoded.deadline, 2200n);
});
test('mint respects uninitialized pools, insufficient balances and slippage bounds', () => {
  assert.throws(() => buildMint(config, { ...snapshot, sqrtPrice: 0n }, account, '1', '1', 50), /initialized/);
  assert.throws(() => buildMint(config, { ...snapshot, balance: 0n }, account, '1', '1', 50), /Insufficient FARMX/);
  assert.throws(() => buildMint(config, { ...snapshot, nativeBalance: 1n }, account, '1', '1', 50), /Insufficient ETH/);
  assert.throws(() => buildMint(config, snapshot, account, '1', '1', 200), /slippage/);
});
test('missing chain adds the exact handoff chain parameters then switches again', async () => {
  const calls: { method: string; params?: unknown[] }[] = [];
  const provider: Provider = { request: async args => { calls.push(args); if (calls.length === 1) throw { code: 4902 }; return null; } };
  await switchChain(provider, config);
  assert.deepEqual(calls.map(x => x.method), ['wallet_switchEthereumChain', 'wallet_addEthereumChain', 'wallet_switchEthereumChain']);
  assert.deepEqual(calls[1].params, [config.manifest.walletAddChain]);
});
test('switch rejection never adds a chain; account/chain changes abort signing', async () => {
  let calls = 0;
  await assert.rejects(switchChain({ request: async () => { calls++; throw { code: 4001 }; } }, config));
  assert.equal(calls, 1);
  await assert.rejects(assertWallet({ request: async ({ method }) => method === 'eth_accounts' ? [account] : '0x1' }, account, config.chain.id), /changed/);
});
test('canonical ABI hashing and relative path validation', () => {
  assert.equal(canonical([{ z: 1, a: { z: 2, a: 3 } }]), '[{"a":{"a":3,"z":2},"z":1}]');
  for (const p of ['../abi.json', '/abi.json', 'https://evil/abi', 'a/../b', './x']) assert.throws(() => relativeAsset(p));
  assert.equal(relativeAsset('abi/FARMX.json'), 'abi/FARMX.json');
});
test('failed simulation or missing PositionManager code prevents a wallet send', async () => {
  const requests: string[] = [];
  const provider: Provider = { request: async ({method}) => { requests.push(method); return method === 'eth_accounts' ? [account] : config.manifest.walletAddChain.chainId; } };
  const rpc = {
    getChainId: async () => config.chain.id,
    getCode: async () => '0x6000',
    readContract: async ({functionName}: {functionName: string}) => functionName === 'permit2' ? config.addresses.permit2 : config.addresses.poolManager,
    simulateContract: async () => { throw Error('Simulation reverted: OnlyBeneficiary'); },
  } as unknown as Reader;
  const tx = contractTx(config.hook.address, config.hook.abi, 'fund', [config.poolKey, 0n]);
  await assert.rejects(sendTransaction(config, rpc, provider, account, tx, () => {}), /Simulation reverted/);
  assert(!requests.includes('eth_sendTransaction'));
  rpc.getCode = (async () => undefined) as Reader['getCode'];
  await assert.rejects(sendTransaction(config, rpc, provider, account, tx, () => {}), /no deployed code/);
  assert(!requests.includes('eth_sendTransaction'));
});
