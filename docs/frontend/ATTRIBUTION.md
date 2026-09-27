# Design and integration references

The supplied Better Interface guide was used as design knowledge, not copied into application code. The implementation review and design documentation credit the two distinct upstream works:

- Jakub Krehel, [Better Interface](https://github.com/jakubkrehel/skills/tree/267330e1adfc66a718fb65fa6918c1f06d0a689e/skills/better-interface), pinned commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`, MIT.
- Paul Bakaus, [Impeccable documentation method](https://github.com/pbakaus/impeccable/blob/9d715cc4f5564a990ca8345abfdd5df6dc9b41c8/skill/reference/document.md), pinned commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`, Apache-2.0. The supplied reference adapts this method for assignment-scoped design documentation. These are separate works, not a relicensing of either upstream. No full guide or license text is redistributed by this frontend.

Uniswap integration was checked against the repository's existing pinned source, listed in `docs/dependencies.json`, including `StateView.sol`, `IPositionManager.sol`, `Actions.sol`, `Permit2Forwarder.sol`, the implementation ABI exports, and the existing PositionManager integration tests. No protected source was changed.

Primary-source cross-checks on 2026-09-27:

- [Uniswap SDK position minting](https://developers.uniswap.org/docs/sdks/v4/guides/managing-liquidity/position-minting): SDK construction and PositionManager settlement/refund flow.
- [Uniswap StateView](https://developers.uniswap.org/docs/protocols/v4/guides/state-view): offchain pool and position state reads.

Deployed addresses were taken exclusively from the supplied deployment/network inputs. No published address list, memory, or search result was used to override them. Package licenses remain recorded by npm dependencies; package contents are installed for building and are not vendored. The leaf mark/favicon and application CSS are original code created for this assignment.
