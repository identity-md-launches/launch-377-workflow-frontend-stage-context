# Farm: implemented interface

## Overview

Farm is a single-page Sepolia liquidity experiment for visitors funding rewards, enrolling full-range liquidity, and claiming as a beneficiary. The implemented direction is a quiet, warm dashboard: cream backgrounds, dark olive text, serif headings, and one green primary action. The stream appears before actions; mint and fund form a desktop pair; positions and recent activity follow. This direction was inferred from the Farm name and practical task, not supplied as a separate approved brand system.

The source of truth is `web/src/styles.css`, with page patterns and small components in `web/src/App.tsx`. Validation and screenshots describe the production export, not a design mockup. Only a light theme and English interface are implemented.

## Colors

All colors are sRGB hexadecimal CSS custom properties in `styles.css:1`.

| Token | Value | Role |
| --- | --- | --- |
| `--paper` | `#f5f5ee` | Page, disabled field, explanatory inset |
| `--surface` | `#fffef9` | Cards, fields and neutral buttons |
| `--tint` | `#e9ecdf` | Stream panel, disabled button and neutral hover |
| `--ink` | `#242f25` | Main text and leaf mark |
| `--muted` | `#5a6457` | Descriptions, hints and units |
| `--line` | `#cdd3c3` | Structural dividers and card boundaries |
| `--control` | `#78836f` | Input/button and empty-state boundaries |
| `--accent` / `--accent-hover` | `#2f563c` / `#23422e` | Primary button resting/hover state |
| `--on-accent` | `#fffef9` | Primary button label |
| `--focus` | `#285ed4` | Keyboard focus perimeter |
| `--danger` / `--danger-bg` | `#8e302b` / `#fff0e9` | Error text/border and error surface |
| `--note` | `#eeebd9` | Wrong-network and transaction-status panels |

Measured rendered text pairs are recorded in `frontend/contrast.json`: body on paper 12.71:1; muted on paper 5.65:1; muted on stream tint 5.16:1; primary label on accent 8.26:1; hints on cards 6.13:1. These measurements do not claim every possible browser state was measured. Errors and statuses always carry text, not color alone.

## Typography

Body and controls use `Arial, Helvetica, sans-serif`, 16px base, line-height 1.55. Headings use `Georgia, 'Times New Roman', serif`, weight 400. These are system stacks; there are no downloadable fonts. Browser-computed family requests were checked; the actual platform fallback face can vary.

- H1: `clamp(2.7rem, 5.5vw, 4.75rem)`, line-height 1.08, spacing −.045em.
- H2: `--section: 1.65rem`, line-height 1.2, spacing −.025em.
- H3: 1rem, weight 600, line-height 1.4.
- Controls/labels: `--small: .875rem`; form inputs and selects remain 1rem at all widths.
- Hints/units: `--caption: .8125rem`, line-height 1.55. Eyebrows: .6875rem, weight 600, .12em spacing, CSS uppercase.
- Metric figures: fluid 1.6–2.2rem, 2rem below 40rem. Tabular numerals apply globally. Large raw liquidity totals use scientific notation with an exact-total disclosure.

Headings use balanced wrapping, descriptions use pretty wrapping, intro copy is capped at 43ch, and card prose at 60ch. Addresses, hashes and long hints can wrap anywhere. Short wallet addresses link to the complete explorer address; position keys have an explicit disclosure. Transaction maximums retain full decimal precision.

## Layout

`.wrap` is 1168px maximum including 24px inline padding; mobile padding is 16px. Main spacing tokens are 8, 16, 24, 32 and 48px. Cards use 32px padding and forms use 16px inner gaps. Logical inline/block properties preserve natural reading order.

- Above 58rem (928px), the intro has a 290px note column and actions use a `1.15fr 1fr` grid. The overview has three metric columns.
- At 58rem and below, intro and forms stack; position content and claims stack.
- At 40rem (640px) and below, metrics stack, card padding becomes 20px, activity rows and deployment address rows stack, and headers wrap.
- At 23rem (368px) and below, paired inputs/options become single columns.

Browser checks covered 320, 390, 800 and 1440px. No horizontal page overflow occurred, including with long position values. An 800px viewport with the root font enlarged to 32px also passed reflow; this is text enlargement, not browser-native zoom. No fixed-height text boxes, sticky panels, or horizontal carousels are used.

## Elevation & Depth

The interface is flat: there are no shadows, overlays, or glass layers. Tonal backgrounds distinguish stream information, action cards and transaction notices. Borders communicate structure or input affordance. The skip link is the only elevated element (`z-index: 2`) and is exposed on keyboard focus.

## Shapes

Cards use 12px corners, empty states 10px, buttons/notices 7px, inputs 6px, and pills 20px. Buttons have at least 44px height and fields at least 48px. `Mark` is a decorative inline leaf SVG with a 2px stroke and `currentColor`. `web/public/farm.svg` is the matching local favicon.

## Components

- `Metric` in `App.tsx`: description term/value/unit with optional exact-total disclosure; used in the overview's definition list.
- `External`: a native external link with a decorative arrow and safe new-tab relationship.
- `Mark`: decorative leaf, used only with visible surrounding text.
- `.panel`, `.field`, `.field-row`, `.hint`, `.field-error`: form patterns with explicit labels, decimal keyboards, described errors and native disabled fieldsets. Invalid submit focuses a field.
- Buttons: neutral by default, `.primary` for the single emphasized next action, `.quiet` for low-emphasis text actions, `.wide` for full-width form actions. Connection is primary before connection; preview becomes primary afterward. Disabled prerequisites have an adjacent explanation.
- `.preview`/`.steps`: exact transaction limits plus three separate mint/approval buttons. Preview clears on input/account/network changes and expires before its deadline.
- `.position-list`/`.claim`: beneficiary position, expandable full key, staked and StateView liquidity, earned amount, claim action; paginated in groups of ten keys.
- `.notice.error`, stable alert/status regions: RPC/wallet/transaction feedback; errors persist until recovery. Explorer transaction links remain available after a send.
- Native `details`/`summary`: exact liquidity, position keys and deployment addresses. They retain native keyboard behavior.

The skip link precedes the header. All controls use native semantics and a 3px focus outline with 4px offset. Forced colors switches the outline to `Highlight`. Hover rules are gated by `(hover: hover)`. The only animation is a 120ms button background/press transition with .96 press scale, enabled only under `prefers-reduced-motion: no-preference`.

## Do's and Don'ts

Start related surfaces with `.wrap`, reuse the role colors and spacing tokens, keep one visible primary emphasis, and label every amount with its token/unit. Show exact spend limits and preserve access to full identifiers. Add status text alongside any color. Keep actions in document flow so small screens and text enlargement can reach them.

Do not reuse divider colors for text, introduce charts for unavailable data, interpret liquidity as token amounts, or add alternate configuration maps. Contract prerequisites must remain enforced regardless of visual state. A future page can reuse these patterns, but this delivery intentionally remains one static page.

Design guidance: Jakub Krehel's Better Interface, MIT, pinned commit `267330e1adfc66a718fb65fa6918c1f06d0a689e`. Documentation method: Paul Bakaus's Impeccable, Apache-2.0, pinned commit `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`. See `frontend/ATTRIBUTION.md`.

This document is under `docs/` because the assignment's overriding write allowlist excludes root `DESIGN.md`.
