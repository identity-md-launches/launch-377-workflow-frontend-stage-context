# Farm frontend

One static React + TypeScript page for the deployed ETH/FARMX liquidity reward hook on Sepolia. It reads the stream, recent hook events, and beneficiary positions; it supports funding, full-range PositionManager minting, and beneficiary claims. It intentionally has no swap, withdrawal, NFT transfer, token transfer, or administrative interface. These boundaries follow the approved website brief.

FARMX and reward pots are test tokens with no value or promised return.

## Install, build, preview

Use Node 22.12+ (validated with Node 24.21.0 and npm 11.19.0). All dependency and build configuration lives here; root Solidity configuration is unchanged.

```sh
cd web
npm ci --cache /tmp/farm-npm-cache
npm run typecheck
npm run build
npm run check:export
npm run preview
```

`npm run build` writes `../dist/` with Vite's relative `./` base, then emits `imd-deployment.json` last. Serve `dist/` over HTTP(S), including from a gateway subpath. No server rewrites or backend are needed. Direct `file://` opening is unsupported because the app fetches its configuration and ABI files. Browser wallets require a secure context (HTTPS or localhost). No external fonts, image services, or analytics are loaded.

`npm run dev` builds and previews the export; rebuild after edits. For a gateway-like preview use `node scripts/serve.mjs` and open `http://127.0.0.1:4173/preview/`. This helper stops after an hour and can be stopped earlier with Ctrl+C.

## Configuration and provenance

The **only runtime deployment configuration is `dist/imd-deployment.json`**. `src/config.ts` fetches that file, then the ABI paths declared in it. It verifies each ABI asset's SHA-256 and each launch ABI's canonical Keccak before rendering wallet controls. It constructs the chain, public RPC fallback, pool key, pool ID, and every contract destination from that configuration.

`config/handoff.json` and `config/network.json` preserve the supplied build inputs. They are not imported into the browser bundle. The export script:

1. Retrieves `docs/abi/<Contract>.json` using `git show` at the handoff's deployed `sourceCommit`, and compares it byte-for-byte with the repository export.
2. Checks Keccak-256 of compact JSON with recursively sorted object keys and unchanged array order against each handed-off ABI hash.
3. Copies both raw implementation ABI arrays unchanged, and emits narrow Uniswap/Permit2 interfaces from the pinned source signatures.
4. Copies the identifiers, exact contract set, unchanged network object, exact wallet-add-chain parameters, pool description, and deployment block into the manifest.
5. Inventories every other exported file, with lowercase SHA-256, relative paths, no symlinks, no self-hash, and conservative size limits.

Keep the pinned source commit available in Git to rebuild. Rebuild after **any** export edit; editing assets without regenerating the manifest invalidates the inventory. Do not hand-edit deployed identifiers or add a second address map. The handoff's attestation identifier is preserved; the app does not independently verify an attestation signature.

## Wallets and actions

An injected EIP-1193 browser wallet is supported. No WalletConnect project ID or private RPC credentials were supplied, so no hosted connector is configured. Wallet signing stays in the visitor's wallet. Read requests try the public RPCs in order, then the injected wallet only when it is on the configured chain. Unknown-chain switching offers `wallet_addEthereumChain` with the supplied exact parameters, then switches again.

The page verifies RPC chain ID, nonempty bytecode for both deployed contracts and PoolManager, StateView, PositionManager and Permit2, and matching PoolManager/Permit2 bindings. It also checks deployed token metadata. Missing verification, wrong chain, uninitialized pool, old reads, and pending actions disable transaction controls. These checks establish connectivity and configuration consistency, not a bytecode attestation or a security audit.

- **Fund:** approve the exact entered FARMX amount to the hook, then call `fund(poolKey, amount)`. Zero is supported without approval and restarts remaining/idle rewards. Funds are contributions; the funder has no withdrawal right.
- **Mint:** preview budgets using the current StateView price and Uniswap v4 SDK. Ticks are fixed at **−887220 / 887220**. The SDK emits `MINT_POSITION → SETTLE_PAIR → SWEEP` through the published PositionManager. The connected wallet is both NFT recipient and `abi.encode(address)` hookData beneficiary. The review shows maximum ETH/FARMX spend, liquidity, price, recipient, slippage, and a 20-minute deadline. Maximum spends remain within the entered budgets. Approve the exact FARMX maximum to Permit2, then approve PositionManager within Permit2 for that maximum until the deadline. Mint sends only the maximum ETH; the SDK sweeps excess ETH to the sender. Pool initialization and shared test routers are never used.
- **Claim:** call the hook's `claim(poolKey, positionKey)` only for positions whose permanent beneficiary matches the connected wallet. Zero-stake historical positions can still claim accrued rewards. NFT ownership does not determine reward ownership. HookData itself is unauthenticated; this page relies on PositionManager's authenticated position control and unique NFT salt.

Every write is simulated with the same account, value, calldata and destination before requesting a wallet signature. Account/chain are checked again before sending. Receipts, reverts, replacements, timeouts and wallet rejection have visible status; transaction hashes link to the explorer. A confirmed transaction is refreshed into the reads. Transaction signing, public RPC availability, and gas sufficiency remain subject to live conditions.

## Reads and limitations

Reads refresh every 20 seconds and use one block number for a snapshot. Hook `positionCount`/`positionAt` paginate ten beneficiary references at a time; these are the bounded equivalents of `positionsOf`. References are filtered to this pool. Each position reads `staked`, `earned`, `beneficiaryOf` and StateView `getPositionInfo(poolId, positionKey)`. The position key comes from the hook; it is never incorrectly derived from the wallet address.

StateView supplies pool price, tick, active liquidity and position liquidity. Hook views supply reward rate, period end, total stake, remaining emissions and idle tokens. Stored rates stop displaying as active after period end. Raw liquidity units are not token balances. Large totals use scientific notation with an expandable exact total. Event reads show up to eight Staked/Unstaked/Funded/Claimed events from the latest 2,000 blocks; this is not a full history or an indexer. RPC event failures are reported separately from usable state reads.

Out-of-range liquidity earns equally per unit. The first beneficiary is permanent, even after NFT transfer; other routers' positions can appear in beneficiary reads. Only full-range minting is exposed, with all liquidity writes sent to PositionManager. There is no claim-right transfer or removal UI in this assignment.

## Validation

```sh
npm test
npm run test:browser
npm run check:rpc
```

Install a Playwright Chromium browser with `npx playwright install chromium` when needed, or set `CHROMIUM_PATH` to an existing Chromium executable. The worker used `/root/.cache/ms-playwright/chromium-1246/chrome-linux64/chrome`. Browser tests start the bounded preview themselves unless it is already running. Tests must run after a build because they consume the exact exported manifest and ABI files.

Browser interaction tests intercept every configured RPC endpoint and inject a mock wallet. They **do not send live transactions**. Screenshot names ending in `.mock.png` contain synthetic state. The separate RPC script only reads live chain state and writes `docs/frontend/rpc-check.json`.

See [validation](../docs/frontend/VALIDATION.md), [design](../docs/DESIGN.md), and [recorded browser checks](../docs/frontend/browser-results.json). Publication/CID checks belong to the publisher and are not represented as worker results.

## Path and size budget

The explicit ignore-file budget is **one path: `web/.gitignore`, at most 1 KiB**. It excludes generated dependency, cache, coverage, report and archive names at every nesting level within `web/`. Package sources, lockfile, source code, and all required runtime assets remain included. No vendored registry, dependency archives, node_modules, submodules, or browser binaries are part of the submission. Test scratch files are excluded by the existing root ignore and are not required to build.

The requested root `DESIGN.md` conflicts with the higher-priority write allowlist. The full implemented design document is delivered at `docs/DESIGN.md`; root files remain unchanged.
