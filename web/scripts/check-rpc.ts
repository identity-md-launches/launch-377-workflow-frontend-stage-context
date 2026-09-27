import { readFile, writeFile } from 'node:fs/promises';
import { makeConfig, publicClient, type Manifest } from '../src/config';
import { readSnapshot, readActivity, verifyDeployment } from '../src/chain';
import type { Abi } from 'viem';
const root = new URL('../../', import.meta.url);
const m: Manifest = JSON.parse(await readFile(new URL('dist/imd-deployment.json', root), 'utf8'));
const abis: Record<string, Abi> = {};
for (const { name, abiPath } of m.contracts) abis[name] = JSON.parse(await readFile(new URL(`dist/${abiPath}`, root), 'utf8'));
for (const [name, path] of Object.entries(m.interfaces)) abis[name] = JSON.parse(await readFile(new URL(`dist/${path}`, root), 'utf8'));
const c = makeConfig(m, abis), rpc = publicClient(c);
const result: Record<string, unknown> = { checkedAt: new Date().toISOString(), chainId: m.chainId, poolId: c.poolId, rpcUrls: m.network.rpcUrls, broadcastTransactions: false };
try {
  await verifyDeployment(c, rpc);
  result.verification = 'Passed: chain ID, all required contract code, PoolManager and Permit2 bindings';
  result.snapshot = await readSnapshot(c, rpc);
  result.events = await readActivity(c, rpc, (result.snapshot as { block: bigint }).block);
} catch (e) {
  result.error = e instanceof Error ? e.message : String(e);
  process.exitCode = 1;
}
const output = JSON.stringify(result, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
await writeFile(new URL('docs/frontend/rpc-check.json', root), output + '\n');
console.log(output);
