import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keccak256, toBytes } from 'viem';
const root = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, root));
const m = JSON.parse(await read('dist/imd-deployment.json'));
const h = JSON.parse(await read('web/config/handoff.json'));
const n = JSON.parse(await read('web/config/network.json'));
function sort(v) { return Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sort(v[k])])) : v; }
for (const key of ['version', 'launchId', 'chainId', 'sourceCommit', 'attestationHash']) assert.deepEqual(m[key], h[key]);
assert.deepEqual(m.network, n.network);
assert.deepEqual(m.walletAddChain, n.walletAddChain);
assert.deepEqual(m.contracts.map(({abiPath, ...c}) => c), h.contracts.map(({name,address,abiHash}) => ({name,address,abiHash})));
assert(m.assets.length <= 128);
const actual = (await readdir(new URL('dist/', root), { recursive: true, withFileTypes: true })).filter(x => x.isFile()).map(x => relative(fileURLToPath(new URL('dist/', root)), join(x.parentPath, x.name))).filter(x => x !== 'imd-deployment.json').sort();
assert.deepEqual(m.assets.map(x => x.path).sort(), actual);
let total = 0;
for (const a of m.assets) {
  assert(/^[\w./-]+$/.test(a.path) && !a.path.startsWith('/') && !a.path.split('/').includes('..'));
  const bytes = await read(`dist/${a.path}`);
  total += bytes.length;
  assert(bytes.length <= 8388608);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), a.sha256);
}
for (const c of m.contracts) {
  const abi = JSON.parse(await read(`dist/${c.abiPath}`));
  assert.equal(keccak256(toBytes(JSON.stringify(sort(abi)))).slice(2), c.abiHash);
}
assert(total < 32 * 1024 * 1024);
const html = (await read('dist/index.html')).toString();
assert(!/(?:src|href)="\//.test(html));
console.log(`PASS: ${actual.length} complete assets; SHA-256, canonical ABI Keccak, handoff, unchanged network and relative HTML; ${total} bytes.`);
