import { readFileSync } from 'node:fs';
import { makeConfig, type Manifest } from '../src/config';
import type { Abi, Address, Hex } from 'viem';
import type { Snapshot } from '../src/chain';
const root = new URL('../../dist/', import.meta.url);
export const manifest: Manifest = JSON.parse(readFileSync(new URL('imd-deployment.json', root), 'utf8'));
const abis: Record<string, Abi> = {};
for (const c of manifest.contracts) abis[c.name] = JSON.parse(readFileSync(new URL(c.abiPath, root), 'utf8'));
for (const [name, path] of Object.entries(manifest.interfaces)) abis[name] = JSON.parse(readFileSync(new URL(path, root), 'utf8'));
export const config = makeConfig(manifest, abis);
export const account: Address = '0x1111111111111111111111111111111111111111';
export const positionKey: Hex = `0x${'ab'.repeat(32)}`;
export const snapshot: Snapshot = {
  block: BigInt(manifest.deploymentBlock + 100), timestamp: BigInt(Math.floor(Date.now() / 1000)), fetchedAt: Date.now(), decimals: 18, symbol: 'FARMX',
  rate: 10n ** 18n, end: BigInt(Math.floor(Date.now() / 1000) + 86400), totalStaked: 10n ** 20n, idle: 100n * 10n ** 18n, remaining: 86400n * 10n ** 18n,
  sqrtPrice: 2n ** 96n, tick: 0, poolLiquidity: 10n ** 20n, balance: 10000n * 10n ** 18n, nativeBalance: 10n * 10n ** 18n,
  hookAllowance: 0n, tokenAllowance: 0n, permitAmount: 0n, permitExpiration: 0, positionCount: 1n,
  positions: [{ key: positionKey, staked: 10n ** 18n, liquidity: 10n ** 18n, earned: 25n * 10n ** 18n, beneficiary: account }],
};
