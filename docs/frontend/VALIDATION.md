# Frontend validation — worker evidence

Date: 2026-09-27. Scope: one production page at `/preview/`, frontend source under `web/`, export under `dist/`, documentation under `docs/`. No contract sources, root build configuration, dependencies under `lib/`, deployment state, or published site were changed.

## Outcome and executed checks

| Check | Actual result |
| --- | --- |
| `npm --prefix web run typecheck` | Passed, TypeScript 7.0.2, no errors |
| `npm --prefix web run build` | Passed; Vite 8.3.1; final export and manifest generated |
| `npm --prefix web run check:export` | Passed: exact handoff identity/contract set, unchanged network and wallet-add-chain objects, canonical ABI Keccak, all asset SHA-256 hashes, relative paths, complete inventory |
| `npm --prefix web test` | 7 tests passed, 0 failed |
| `CHROMIUM_PATH=/root/.cache/ms-playwright/chromium-1246/chrome-linux64/chrome npm --prefix web run test:browser` | 10 browser tests passed, 0 failed, final run 8.5 seconds |
| `npm --prefix web run check:rpc` | Passed, live read-only Sepolia check; block 11791717, recorded in `rpc-check.json` |
| Browser tool: production `/preview/` navigation, desktop/mobile inspection | Passed; actual screenshots inspected; final browser console 0 errors and 0 warnings |
| Automated accessibility | axe WCAG 2 A/AA + 2.1 AA tags: 0 violations in the connected mock flow |

The final production asset inventory has **10 files totaling 1,031,626 bytes**, excluding the small manifest. Largest file is the approximately 974 KB application JavaScript bundle. Vite reports a chunk-size advisory; it is not a build failure. Runtime assets remain local. The export is far below the checker HTTP budget and 128-file/8-MiB-per-file limits. See `submission-size.json` for the final complete Git bundle size check.

The two ABI arrays were retrieved from `docs/abi/` at source commit `ccf309b7a619dbb9ea87a4ab76af84471cc90574`, compared byte-for-byte with the checked-out exports, and hashed using canonical JSON Keccak-256:

| Contract | Verified ABI hash |
| --- | --- |
| FARMX | `38880b8e56d42ce900f744a7908c7139632a49f1c3f33385c64ceaed29d37bee` |
| LiquidityMiningHook | `255e14cf68d07d7d2782d502f94d292d9052632ba580fcf5a3934fa352309c63` |

The emitted runtime manifest preserves the supplied launch ID, source commit, chain ID, attestation hash, contract names/addresses/hashes, and unchanged network object. Its inventory excludes itself. No input under `.imd/reads/` is needed at build time.

## Interaction coverage

Tests run against the **built export**, with configured RPC requests intercepted and a synthetic EIP-1193 wallet. They cover:

- Disconnected and missing-wallet states; rejection while connecting.
- Wrong chain; 4902 → exact `wallet_addEthereumChain` payload → switch again; cancelled switching does not add a chain.
- Repeated wallet chain events and account changes; preview reset and beneficiary eligibility.
- Funding input errors and focus; exact token approval spender/amount; fund transaction; zero-amount restart without approval.
- Mint preview and balance/precision validation; exact Permit2 token approval; Permit2 approval to PositionManager; approved spender and expiry; mint destination; decoded full-range ticks, wallet recipient and hookData, maximum spend bounds, native value and refund action.
- Hook/StateView reads, all four event types, earned rewards and claim; zero earned becomes disabled; ten-key pagination.
- Simulation failures, wallet rejection and reverted receipts; no false success or premature wallet send.
- Missing PositionManager code, unavailable RPC, and corrupted ABI file; all fail closed with recovery text.
- Keyboard skip link and native input Tab order; visible focused input; named controls and associated labels; persistent error/status regions.
- Widths 320, 390, 800 and 1440 CSS pixels; no horizontal document overflow. Root-font enlargement to 32px at width 800 also had no overflow.

`browser-results.json` records inspected sizes, no page errors, the RPC methods used and **mock** transaction destinations. `desktop.mock.png` and `mobile.mock.png` show synthetic stream/position/transaction data; they are not evidence of real transactions. `desktop.live.png` shows the actual disconnected live state. `browser-console.txt` records the final browser-tool console. `contrast.json` records computed foreground/background pairs and measured WCAG ratios.

## Better Interface consolidated review

The pinned workflow, core principles of all six domains and document-web-design method were read and applied. The visual direction was inferred: warm neutral dashboard, green primary action, serif headings, native controls, one light theme. Design scope remained the requested page. The approved website says “nothing else,” so generic swap guidance did not add swap controls.

| Domain | Coverage and evidence | Limitations |
| --- | --- | --- |
| Accessibility | **Checked.** Native buttons/forms/details, explicit labels, skip link, heading order, invalid-field focus, 44px minimum buttons, 48px fields, visible 3px focus ring, dynamic status/alert semantics, zero targeted axe violations. | No screen-reader session, physical device, browser-native zoom, or forced-colors visual session. Axe is not proof of complete accessibility. |
| Layout | **Checked.** Production screenshots at desktop/mobile; measured no overflow at 320/390/800/1440; 200% root-font enlargement; stacked grid and address wrapping. | No RTL/localized product variant exists. Native browser zoom was not measured. |
| Writing | **Checked.** Action verbs, separate approval labels, units, explicit test-token/no-return text, zero-funding behavior, permanent beneficiary and out-of-range simplification; recoverable errors and honest empty states. | English only. No user comprehension study. |
| Typography | **Checked.** Computed 16px form inputs, descending headings, line-height/measure, tabular figures; large-liquidity finding fixed and rechecked in final mock screenshots. | System font stacks vary across platforms; exact installed glyph face not independently fingerprinted. |
| Colors | **Checked.** Rendered pairs measured: muted on tint 5.16:1; muted on paper 5.65:1; body on paper 12.71:1; primary label 8.26:1; card hint 6.13:1. Status has redundant text. | Only light theme. Focus ring inspected visually; not every focus/background combination separately measured. |
| UI | **Checked.** Loading, empty, connected, disabled, error, preview and confirmed states; restrained tonal surfaces and consistent borders; native disclosures. Motion is a 120ms button transition gated by reduced-motion preference. | No motion playback at 10% speed or physical touch device test. No overlays, dialogs, localization, or dark theme are part of this page. |

## Findings and corrections

| Severity | Source | Observed finding / correction / recheck |
| --- | --- | --- |
| Medium | `web/src/App.tsx:16`, `web/src/styles.css:55` | In the first connected desktop screenshot, a 21-digit raw stake figure wrapped mid-number. `Metric` now shows scientific notation for large totals and a native “Exact total” disclosure. Final desktop/mobile screenshots and width tests rechecked it. |
| Low | `web/index.html:7`, `web/public/farm.svg` | First browser navigation requested a missing root favicon, causing a console 404. Added a relative local SVG favicon. Final production navigation reports no console errors. |
| Medium | `web/src/App.tsx:64` | Source review found that repeated same-account/same-chain events could clear data without triggering immediate reload. A wallet epoch now triggers a new read even when identity values are unchanged. Added and passed the repeated-event browser regression. |
| Medium | `web/src/chain.ts:96` | Receipt handling needed to distinguish a successful cancellation/replacement from a successful original action. Non-repricing replacements now report an incomplete action and retain the explorer link. Source reviewed; live transaction replacement was not exercised. |
| Low | `web/scripts/check-export.mjs:18` | The first inventory checker mishandled a trailing separator in root file paths. Replaced string splitting with path-relative enumeration. Checker now matches all 10 actual exported assets and their hashes. |

The initial browser mock also eagerly computed a position index for unrelated calls and overflowed. Corrected the fixture so it computes that index only for `positionAt`; no contract or production failure was inferred from that fixture error. Final tests above were rerun after applicable fixes. No unresolved observed UI blocker remains.

## Live chain observations and unperformed behavior

The read-only check confirmed the configured chain, nonempty code for FARMX, LiquidityMiningHook, PoolManager, StateView, PositionManager and Permit2, and matching PoolManager/Permit2 bindings. On the recorded block the reward rate, period end, enrolled stake and active pool liquidity were zero; the initialized pool tick was 177284. Browser reads also succeeded from the public endpoint. This is a point-in-time observation, not a promise about later RPC availability.

**No real approvals, funding, mints, claims, swaps, or redeployments were broadcast.** No funded wallet was used. Real wallet extension behavior, hardware wallets, gas costs, fee changes, competing transactions, transaction replacements, reorgs, and full historical event discovery remain untested live-chain behavior. Mock calldata and status tests do not establish successful execution with real funds. Wallet receipt timeouts direct visitors to the explorer before retrying.

`npm audit --omit=dev` was also inspected: 30 dependency-tree advisories (16 low, 4 moderate, 10 high), including transitive SDK tooling (Hardhat/solc/Mocha), ethers/elliptic and ws. There was no automatic compatible fix reported. The static export contains no installed dependency directories, Node server tooling or private signing code of our own; browser signing uses the visitor's provider and RPC transport uses HTTP. These counts are a dependency-maintenance limitation, not an independent security assessment or a claim that advisory paths are exploitable through this interface.

## Delivery constraints

The explicit ignore-file path budget is `web/.gitignore` only, under 1 KiB. It excludes nested generated dependencies/caches/reports and tarballs. The committed export is outside that ignore scope. The complete source, lockfile, ABI files and runtime assets remain included; no registry mirror, vendored archive or submodule is introduced.

The root `DESIGN.md` request conflicts with the overriding path allowlist. The completed document is `docs/DESIGN.md`; no root design file or root build configuration is modified. Generated browser-tool scratch output is removed before delivery.

**Complete for the stated frontend implementation and worker-validation scope; repository commit blocked by the workspace.** `git add web dist docs/DESIGN.md docs/frontend` failed because `.git/index.lock` could not be created on the read-only `.git` mount. No repository commit or staging is claimed. All source/export/evidence files are present for the submission collector. A disposable scratch clone is used only to measure the complete prospective Git bundle; it does not modify or substitute for the repository's protected Git metadata.

The root-design-path exception and unperformed live behaviors above remain explicit. Publication, site naming, CID verification and control-plane RPC checks are not worker-completion prerequisites and were not performed or claimed. These results are worker evidence, not an independent certification.
