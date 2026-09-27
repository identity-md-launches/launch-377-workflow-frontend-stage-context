import { Ether, Token, Percent } from '@uniswap/sdk-core';
import { Pool, Position, V4PositionManager } from '@uniswap/v4-sdk';
import { encodeAbiParameters, parseUnits, type Address, type Hex } from 'viem';
import type { Config } from './config';
import type { Snapshot } from './chain';

export const LOWER_TICK = -887220;
export const UPPER_TICK = 887220;
export function amountInput(text: string, decimals: number, allowZero = false) {
  if (!/^\d+(\.\d+)?$/.test(text) || (text.split('.')[1]?.length ?? 0) > decimals) throw Error(`Enter a ${allowZero ? 'nonnegative' : 'positive'} amount with up to ${decimals} decimals.`);
  const amount = parseUnits(text, decimals);
  if ((!allowZero && amount === 0n) || amount >= 2n ** 128n) throw Error('Enter an amount within the supported range.');
  return amount;
}
export function buildMint(c: Config, s: Snapshot, account: Address, eth: string, token: string, slippageBps: number, now = Math.floor(Date.now() / 1000)) {
  if (![10, 50, 100].includes(slippageBps)) throw Error('Select an available slippage tolerance.');
  const budget0 = amountInput(eth, c.manifest.network.nativeCurrency.decimals);
  const budget1 = amountInput(token, s.decimals);
  if (!s.sqrtPrice) throw Error('The pool is not initialized.');
  const native = Ether.onChain(c.manifest.chainId);
  const farm = new Token(c.manifest.chainId, c.token.address, s.decimals, s.symbol, c.manifest.token.name);
  const pool = new Pool(native, farm, c.poolKey.fee, c.poolKey.tickSpacing, c.hook.address, s.sqrtPrice.toString(), s.poolLiquidity.toString(), s.tick);
  // Reserve space inside the user's budgets for the SDK's maximum spend bounds.
  const available = (n: bigint) => (n * 10000n / BigInt(10000 + slippageBps)).toString();
  const position = Position.fromAmounts({ pool, tickLower: LOWER_TICK, tickUpper: UPPER_TICK, amount0: available(budget0), amount1: available(budget1), useFullPrecision: true });
  if (BigInt(position.liquidity.toString()) === 0n) throw Error('These amounts are too small to mint liquidity. Increase both budgets.');
  const slippageTolerance = new Percent(slippageBps, 10000);
  const maximum = position.mintAmountsWithSlippage(slippageTolerance);
  const max0 = BigInt(maximum.amount0.toString()), max1 = BigInt(maximum.amount1.toString());
  if (max0 > budget0 || max1 > budget1) throw Error('Rounding exceeds your budgets. Increase the amounts and preview again.');
  if (max0 >= s.nativeBalance) throw Error('Insufficient ETH. Leave ETH available for transaction fees.');
  if (max1 > s.balance) throw Error('Insufficient FARMX for this position. Reduce the FARMX budget.');
  const deadline = now + 1200;
  const hookData = encodeAbiParameters([{ type: 'address' }], [account]);
  const call = V4PositionManager.addCallParameters(position, { recipient: account, hookData, slippageTolerance, deadline: deadline.toString(), useNative: native });
  return { data: call.calldata as Hex, value: BigInt(call.value), max0, max1, deadline, liquidity: position.liquidity.toString(), price: pool.currency0Price.toSignificant(6), hookData };
}
export type MintPreview = ReturnType<typeof buildMint>;
