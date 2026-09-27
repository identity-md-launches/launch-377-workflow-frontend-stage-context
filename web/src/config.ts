import { createPublicClient, custom, defineChain, encodeAbiParameters, fallback, http, keccak256, toBytes, type Abi, type Address, type Hex } from 'viem';

export interface Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, callback: (...args: unknown[]) => void): void;
  removeListener?(event: string, callback: (...args: unknown[]) => void): void;
}
declare global { interface Window { ethereum?: Provider } }
export interface Manifest {
  version: number; launchId: string; chainId: number; sourceCommit: string; attestationHash: string;
  contracts: { name: string; address: Address; abiHash: string; abiPath: string }[];
  assets: { path: string; sha256: string }[];
  network: {
    chainId: number; name: string; testnet: boolean; rpcUrls: string[]; explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    faucets: string[];
    uniswapV4: Record<'poolManager' | 'positionManager' | 'stateView' | 'permit2' | 'universalRouter' | 'quoter', Address>;
  };
  walletAddChain: { chainId: Hex; chainName: string; rpcUrls: string[]; nativeCurrency: { name: string; symbol: string; decimals: number }; blockExplorerUrls: string[] };
  pool: { pairedCurrency: Address; fee: number; tickSpacing: number; initialPrice: string };
  token: { contract: string; name: string; symbol: string; decimals: number };
  hook: string; deploymentBlock: number;
  interfaces: Record<'StateView' | 'PositionManager' | 'Permit2', string>;
}
export const poolKeyType = { type: 'tuple', components: [
  { name: 'currency0', type: 'address' }, { name: 'currency1', type: 'address' },
  { name: 'fee', type: 'uint24' }, { name: 'tickSpacing', type: 'int24' }, { name: 'hooks', type: 'address' },
] } as const;
export function canonical(value: unknown): string {
  function sorted(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(sorted);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, x]) => [k, sorted(x)]));
    return v;
  }
  return JSON.stringify(sorted(value));
}
export function relativeAsset(path: string) {
  if (!/^[\w./-]+$/.test(path) || path.startsWith('/') || path.split('/').some(p => p === '..' || p === '.')) throw Error('Unsafe deployment asset path');
  return path;
}
export function makeConfig(m: Manifest, abis: Record<string, Abi>) {
  if (m.version !== 1 || m.chainId !== m.network.chainId || Number(m.walletAddChain.chainId) !== m.chainId) throw Error('Deployment network mismatch');
  const contract = (name: string) => {
    const c = m.contracts.find(c => c.name === name);
    if (!c || !abis[name]) throw Error(`Missing deployment contract: ${name}`);
    return { ...c, abi: abis[name] };
  };
  const token = contract(m.token.contract), hook = contract(m.hook);
  // This bounded interface supports the attested native pool only.
  if (BigInt(m.pool.pairedCurrency) !== 0n || m.pool.tickSpacing !== 60) throw Error('Unsupported pool configuration');
  const poolKey = { currency0: m.pool.pairedCurrency, currency1: token.address, fee: m.pool.fee, tickSpacing: m.pool.tickSpacing, hooks: hook.address };
  const poolId = keccak256(encodeAbiParameters([poolKeyType], [poolKey]));
  const chain = defineChain({ id: m.chainId, name: m.network.name, nativeCurrency: m.network.nativeCurrency,
    rpcUrls: { default: { http: m.network.rpcUrls } }, blockExplorers: { default: { name: 'Explorer', url: m.network.explorer } }, testnet: m.network.testnet });
  return { manifest: m, token, hook, abis, poolKey, poolId, chain, addresses: m.network.uniswapV4 };
}
export type Config = ReturnType<typeof makeConfig>;
export async function loadConfig(): Promise<Config> {
  const base = new URL('./', document.baseURI);
  const response = await fetch(new URL('imd-deployment.json', base), { cache: 'no-cache' });
  if (!response.ok) throw Error('Deployment configuration could not be loaded. Reload to retry.');
  const m: Manifest = await response.json();
  const abis: Record<string, Abi> = {};
  await Promise.all([...m.contracts.map(c => ({ name: c.name, path: c.abiPath, hash: c.abiHash })),
    ...Object.entries(m.interfaces).map(([name, path]) => ({ name, path, hash: undefined }))].map(async c => {
    const asset = m.assets.find(a => a.path === c.path);
    if (!asset) throw Error(`ABI is absent from asset inventory: ${c.name}`);
    const r = await fetch(new URL(relativeAsset(c.path), base));
    if (!r.ok) throw Error(`Unable to load ${c.name} ABI`);
    const bytes = await r.arrayBuffer();
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
    if (digest !== asset.sha256) throw Error(`${c.name} ABI asset integrity mismatch`);
    const abi: Abi = JSON.parse(new TextDecoder().decode(bytes));
    if (!Array.isArray(abi) || (c.hash && keccak256(toBytes(canonical(abi))).slice(2) !== c.hash)) throw Error(`${c.name} ABI attestation mismatch`);
    abis[c.name] = abi;
  }));
  return makeConfig(m, abis);
}
export function publicClient(c: Config, provider?: Provider) {
  return createPublicClient({ chain: c.chain, batch: { multicall: false }, transport: fallback([
    ...c.manifest.network.rpcUrls.map(url => http(url, { timeout: 8000, retryCount: 0 })),
    ...(provider ? [custom(provider, { retryCount: 0 })] : []),
  ], { retryCount: 0 }) });
}
export type Reader = ReturnType<typeof publicClient>;
