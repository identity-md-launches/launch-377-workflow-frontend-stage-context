import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { keccak256, toBytes, parseAbi } from 'viem';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dist = `${root}dist/`;
const handoff = JSON.parse(await readFile(`${root}web/config/handoff.json`, 'utf8'));
const network = JSON.parse(await readFile(`${root}web/config/network.json`, 'utf8'));
const canonical = v => JSON.stringify(sort(v));
function sort(v) {
  if (Array.isArray(v)) return v.map(sort);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, sort(v[k])]));
  return v;
}
if (handoff.chainId !== network.network.chainId || Number(network.walletAddChain.chainId) !== handoff.chainId) throw Error('Chain mismatch');
await mkdir(`${dist}abi`, { recursive: true });
const contracts = [];
for (const c of handoff.contracts) {
  if (!/^[A-Za-z0-9_]+$/.test(c.name)) throw Error('Unsafe contract name');
  const file = `docs/abi/${c.name}.json`;
  const pinned = execFileSync('git', ['show', `${handoff.sourceCommit}:${file}`], { cwd: root });
  const current = await readFile(`${root}${file}`);
  if (!pinned.equals(current)) throw Error(`${file} differs from pinned source`);
  const abi = JSON.parse(pinned.toString());
  if (!Array.isArray(abi)) throw Error('ABI must be an array');
  const actual = keccak256(toBytes(canonical(abi))).slice(2);
  if (actual !== c.abiHash) throw Error(`ABI hash mismatch: ${c.name}: ${actual}`);
  const abiPath = `abi/${c.name}.json`;
  await writeFile(`${dist}${abiPath}`, pinned);
  contracts.push({ name: c.name, address: c.address, abiHash: c.abiHash, abiPath });
  console.log(`Verified pinned ABI ${c.name}: ${actual}`);
}
// Narrow interfaces transcribed from the repository's pinned Uniswap/Permit2 source.
const interfaces = {
  StateView: parseAbi([
    'function poolManager() view returns (address)',
    'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)',
    'function getLiquidity(bytes32 poolId) view returns (uint128)',
    'function getPositionInfo(bytes32 poolId, bytes32 positionId) view returns (uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128)',
  ]),
  PositionManager: parseAbi([
    'function poolManager() view returns (address)',
    'function permit2() view returns (address)',
    'function modifyLiquidities(bytes unlockData, uint256 deadline) payable',
    'function multicall(bytes[] data) payable returns (bytes[] results)',
    'error DeadlinePassed(uint256 deadline)',
    'error MaximumAmountExceeded(uint128 maximumAmount, uint128 amountRequested)',
    'error NotApproved(address caller)',
  ]),
  Permit2: parseAbi([
    'function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)',
    'function approve(address token, address spender, uint160 amount, uint48 expiration)',
    'error AllowanceExpired(uint256 deadline)',
    'error InsufficientAllowance(uint256 amount)',
  ]),
};
const interfacePaths = {};
for (const [name, abi] of Object.entries(interfaces)) {
  interfacePaths[name] = `abi/${name}.json`;
  await writeFile(`${dist}${interfacePaths[name]}`, `${JSON.stringify(abi, null, 2)}\n`);
}
async function files(dir, prefix = '') {
  const paths = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw Error('Symlink in export');
    const path = prefix + entry.name;
    if (entry.isDirectory()) paths.push(...await files(`${dir}/${entry.name}`, `${path}/`));
    else if (path !== 'imd-deployment.json') paths.push(path);
  }
  return paths.sort();
}
const assets = [];
let total = 0;
for (const path of await files(dist)) {
  const data = await readFile(`${dist}${path}`);
  if (data.length > 8388608) throw Error(`Oversize asset: ${path}`);
  total += data.length;
  assets.push({ path, sha256: createHash('sha256').update(data).digest('hex') });
}
if (assets.length > 128 || total > 7 * 1024 * 1024) throw Error('Export exceeds conservative submission budget');
const manifest = {
  version: 1, launchId: handoff.launchId, chainId: handoff.chainId,
  sourceCommit: handoff.sourceCommit, attestationHash: handoff.attestationHash,
  contracts, assets, network: network.network, walletAddChain: network.walletAddChain,
  pool: handoff.manifest.pool, token: handoff.manifest.token, hook: handoff.manifest.hook.contract,
  deploymentBlock: Math.min(...handoff.contracts.map(c => c.blockNumber)), interfaces: interfacePaths,
};
await writeFile(`${dist}imd-deployment.json`, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Export manifest: ${assets.length} assets, ${total} bytes (excluding manifest).`);
