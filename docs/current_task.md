# Current task — Phase 7: Polish (tests + theme kit + a11y)

Status: **IN PROGRESS** (2026-04-18)

The P0–P6 web upgrade is complete (see `roadmap.md`). Phase 7 is a
polish pass focused on three additive tracks chosen because they
**stay out of the way of an in-flight refactor of the app's
component layout** — they add files, append CSS, and register a new
theme rather than restructuring existing components.

## Tracks

### P7.1 — Web test coverage

Stand up a vitest project for the `web/` workspace (the existing
root vitest config covers `tests/**/*.test.ts` against `src/` only —
nothing client-side is tested at the unit level). Tests focus on the
data-shaped surfaces that already have well-defined contracts:

- `compressedHashCodec` — `encodeShareable` ↔ `decodeShareable`
  round-trip, malformed-input rejection.
- `urlHashState` — multi-key read/write, schema decode failure, the
  `subscribeHash` signal.
- `FavoritesStore` — `toggle` / `has` / `clear` against a fake
  `localStorage`, plus persistence round-trip across instances.
- `CompositionStore` — `snapshot()` / `applySnapshot()` round-trip
  preserves the plan envelope.
- Theme registry consistency — every `ThemeId` is present in
  `THEMES`, `FOOTER_COLOPHON`, and the bootstrap allow-list inside
  `web/index.html`.

Implementation choices:

- Use `happy-dom` instead of `jsdom` — lighter, faster, ships
  `localStorage` + `window.location` natively.
- Add `web/vitest.config.ts` rather than expanding the root config so
  the root `vitest run` continues to be a Node-environment solver
  test only — keeps boundaries crisp.
- Add `npm test:web` script to `package.json`.

### P7.2 — 17th edition + theme contribution kit

Add a new edition (`herbarium` — Edwardian botanical specimen
ledger) that exercises only existing layout / glyph / equation
variants, so the registration is purely additive at Layer 1
(`themes.ts`) + Layer 2 (`globals.css`) + bootstrap allowlist +
colophon. This is the canonical small example a contributor can
follow.

Why Herbarium: existing themes cover editorial reference, terminal,
newsroom, zine, arcade, illuminated, blueprint, mythic/tarot,
vaporwave, receipt, board game, subway, spreadsheet, scrapbook,
comic, and maritime chart. Pressed-leaf natural-history is a
distinct visual register that doesn't overlap.

Implementation choices:

- Layout: `sidebar` (no new layout).
- Glyph: `tile` (no new variant).
- Equation: `rendered` (no new variant).
- Fonts: reuse `IM Fell English` + `Cinzel` + `JetBrains Mono` — all
  already loaded by `index.html`. No new Google Fonts URL needed.
- Palette: cream paper (`#F5EFDF`), forest ink (`#1F2A1A`), sage
  accent (`#4F6B3A`), specimen-tag vermilion accent (`#A14B3A`).
- Body treatment: faint hairline grid (graph-paper feel) +
  bottom-right "Pl. XVII / Ed. 17" specimen-tag.

Theme kit refresh:

- Update `docs/themes.md` layout/glyph counts (still accurate at 12 /
  13) and add a checklist row for the Herbarium addition.
- Add a "ship test" reminder pointing at the new theme-registry
  consistency test in P7.1, so future editions get caught by CI if
  they forget the bootstrap allow-list or colophon.

### P7.3 — Accessibility + responsive audit

Strictly additive CSS work appended to `web/src/styles/globals.css`,
plus a minimal set of `aria-label` / `role` additions to stable
components. Avoids touching layout components or restructuring
markup so it doesn't conflict with an in-flight refactor.

Scope:

- A global `:focus-visible` block that gives every interactive
  element a visible oxblood ring with offset, regardless of edition.
  Currently focus styles vary per theme and a few editions (Phosphor
  on dark, Tarot, Comic) have weak or invisible defaults.
- Contrast patches: bump the `--ink-100` floor in dark editions
  (Phosphor, Arcade) so secondary labels meet 4.5:1 against the
  paper surface; raise muted-link contrast in Tarot and Comic.
- Responsive overrides for very narrow viewports (`<400px`):
  collapse the Compose board grid to a single column without
  squeezing the dice glyphs, tighten the Lookup `DiceStepper` so
  three steppers fit on a 320px-wide screen, ensure `min-height` on
  every `<button>` reaches 32px (touch-target floor).
- Minimal `aria-label` and `role="status"` additions on a small set
  of stable elements (favorite toggle, share button, print button,
  loading placeholders) — only where currently missing.

Out of scope: any restructuring of `PageShell`, layouts, or
top-level routing. A skip-link would be ideal but requires touching
the page shell which is the most likely refactor target.

## Verification

- `npm run typecheck` (root + web) — clean.
- `npm run build` (web) — clean, bundle delta tracked in changelog.
- `npm test` (root) — 151/151.
- `npm run test:web` (new) — all green.
- Manual cycle through Lookup / Explore / Compare / Visualize /
  Compose / Gallery / Colophon in Herbarium — heatmap palette,
  glyph, equation render correctly.
- `roadmap.md` and `changelog.md` updated.
