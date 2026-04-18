# Changelog

Running log of session work.

## Unreleased — Compare view: chart modes + richer stats

The Compare ("§ III THE BENCH") chart was visually noisy at the full
1..999 target domain — overlaying four per-target curves with ~1000
samples each obscured the very trends the page exists to show. This
session adds projection modes and richer per-row stats so users can
choose the right summary for the question they're asking.

### `web/src/stores/CompareStore.ts`

- Added `CompareChartMode` (`perTarget` | `avgPerBucket` |
  `countPerBucket` | `cumulative`) with `chartMode` observable +
  `setChartMode` action.
- New `n2k.compare.mode.v1` localStorage key so the user's choice
  survives reload. Mirrors the existing defensive read/persist pattern
  for the selection list. Default mode is `avgPerBucket` because that
  is the most legible at-a-glance summary across the full domain.

### `web/src/features/compare/CompareView.tsx`

- New `ChartModeSelector` (segmented tab control) above the chart,
  matching the page's oxblood / mono / wide-caps idiom.
- `ComparisonChart` refactored to take `mode` + raw series and run
  them through a single `project()` function that returns chart-space
  samples plus axis bounds + tick set. Per-target keeps the original
  "consecutive runs only" line drawing (so unsolvable gaps are
  visible). The two binned modes group targets in 100-wide windows
  (`bucketize`) and emit one sample per non-empty bucket. The
  cumulative mode emits a step sample at every solvable target,
  bookended at the domain max.
- Y-axis label is now drawn rotated on the left so each mode's units
  (`Difficulty`, `Avg difficulty`, `Solvable / 100`,
  `Cumulative solvable`) read at a glance. Y bounds adapt to the
  mode (fixed 0..100 for difficulty/coverage, dynamic `niceCeil` for
  cumulative). Bucketed views use slightly thicker strokes + larger
  dots to signal "each point is an aggregate".
- Summary table gained a **Median** column (median difficulty across
  the triple's solvable targets) and a **Difficulty mix** column
  rendering a four-segment mini-bar of the share of solutions that
  fall in each band: Easy (<25), Medium (25–49), Hard (50–74),
  Brutal (75+). A small legend below the table maps the colors to
  the bands.
- Added `deriveStats(detail)` helper — sorts the difficulty array
  once and emits both median and band counts in a single pass.

### Verification

- `npm --workspace web run typecheck` — clean.
- `npm --workspace web run build` — clean (`index-*.js` 408.64 kB
  gzipped 114.46 kB; bundle delta ~+5 kB for the new code).
- `npm --workspace web run test` — 40/40 passing.
- Manual cycle through all four modes in a 3-triple compare set
  confirmed: Avg / 100 reads as a smooth difficulty trend; Solvable
  / 100 makes coverage falloff obvious; Cumulative ranks the triples
  visually by total reach; Per target preserves the exact (noisy)
  view for power users.

## Unreleased — Phase 7: Polish (tests + 17th edition + a11y/responsive)

A polish pass scoped to be **safe to ship while a separate refactor
is in flight on the component layout**. Three additive tracks; no
existing files were restructured, no JSX was substantially edited,
and only one component code path was touched (none — see the a11y
section). Total deltas: +5 new test files, +1 new theme, ~140 lines
appended to `globals.css`.

### P7.1 — Web test suite (`web/tests/`)

The root `vitest run` covers the solver in a Node environment; the
client side had no unit tests. P7.1 stands up an independent vitest
project for the `web/` workspace using `happy-dom` (lighter / faster
than `jsdom`, native `localStorage` + `window.location`). Lives
at `web/vitest.config.ts`; new `npm run test:web` script in the root
`package.json`. 40 tests, all green.

The five new test files lock down data-shape contracts that earn no
compile-time guarantee:

- `compressedHashCodec.test.ts` — encode/decode round-trip for
  primitives + a representative `SharedPlanV1`; null returns for
  every malformed input class (bad prefix, bad base64, valid
  envelope wrapping non-JSON); a smoke test asserting compression
  actually shrinks repetitive payloads.
- `urlHashState.test.ts` — single-value round-trip; preservation of
  unknown keys when writing; key removal via `null`; `clearHash`
  isolation; URL-encoded keys with reserved characters; the
  intentional asymmetry in `subscribeHash` (fires on `hashchange`
  but not on the util's own `replaceState` writes).
- `FavoritesStore.test.ts` — `toggle`/`add`/`remove`/`clear`,
  triple canonicalization, lex-sorted `list()`, persistence
  round-trip across instances, recovery from corrupt or
  out-of-range persisted data.
- `CompositionStore.test.ts` — `snapshot()` excludes generated
  preview/result data from the URL payload; `applySnapshot` rejects
  non-v1 envelopes and clears prior generation state on replace;
  end-to-end `buildShareUrl` → `loadFromUrl` round-trip preserves
  pool, time budget, seed, kind, and overrides.
- `themeRegistry.test.ts` — every `ThemeId` is present in
  `THEMES`, every `Theme.id` matches its registry key,
  `DEFAULT_THEME` is registered, `swatches` is a 3-tuple, scale
  stops are non-decreasing, every theme has a `FOOTER_COLOPHON`,
  every theme appears in the `index.html` bootstrap allow-list (the
  one that prevents FOUC), every theme is mentioned in the
  `index.html` font-preload comment.

The registry consistency test turns the four-step recipe in
`docs/themes.md` into a CI gate so future contributors can't ship a
half-registered edition.

Deps added (web workspace): `vitest@^2.1.9`, `happy-dom@^15.11.0`.

### P7.2 — Herbarium (17th edition) + theme contribution kit

A new `herbarium` edition — Edwardian botanical specimen ledger.
Cream paper (`#F5EFDF`), forest ink (`#1F2A1A`), sage accent
(`#4F6B3A`), specimen-tag vermilion (`#A14B3A`). Reuses the
`sidebar` layout, `tile` glyph, `rendered` equation, and only fonts
already loaded by `index.html` (`IM Fell English`, `Cinzel`,
`JetBrains Mono`).

Deliberately the smallest-footprint addition possible — purely
additive at Layers 1 (`themes.ts`) + 2 (`globals.css`) + bootstrap
allow-list (`index.html`) + colophon (`ui/nav.ts`). No new layout,
glyph, equation variant, or Google Fonts URL. Now serves as the
canonical example a new contributor can follow.

Decoration on the body card: 32px hairline grid + a faint
top-left pressed-leaf radial gradient, both at <12% opacity so they
don't steal contrast.

Theme contribution kit (`docs/themes.md`) refreshed with a "CI
gate" subsection that maps each registry-consistency test to the
mistake it catches, and points at Herbarium as the canonical
small-example reference.

### P7.3 — Accessibility + responsive audit

CSS-only block appended to `web/src/styles/globals.css` (after the
print rules). Strictly additive — no existing rule is changed. JSX
edits intentionally avoided to leave the in-flight component
refactor untouched.

- **Universal `:focus-visible` ring** — every theme now gets a
  2-pixel oxblood (or `--accent-500` in Tarot/Comic/Vaporwave where
  oxblood blends into the paper) outline with 2px offset on
  keyboard focus. Mouse focus remains suppressed via
  `*:focus { outline: none }`. Closes the gap where Phosphor (dark
  paper) and Comic (halftone) had no discoverable focus state.
- **Skip-to-content rule** — dormant `.skip-to-main` style ready
  for a future `<a class="skip-to-main" href="#main">` anchor in
  `PageShell`. Doesn't activate today but ships the styling so the
  refactor PR only has to add the anchor.
- **Contrast nudges** — Phosphor `--ink-100` muted text bumped to
  `rgb(160 220 180)`, Arcade to `rgb(190 174 240)` so secondary
  labels (`text-ink-100`, `text-ink-100/60`) clear WCAG AA 4.5:1
  against their dark paper.
- **Touch-target floor** — `@media (pointer: coarse)` enforces a
  32×32 minimum on every `<button>`, `[role="button"]`, and
  `<input type=button|submit>` (excluding `.icon-only`). Compromise
  between the dense-numeric controls in the almanac and Apple HIG's
  44px ideal.
- **Narrow-viewport overrides** — `@media (max-width: 400px)`:
  `[style*="repeat(6, minmax(0, 1fr))"]` (the inline grid template
  Compose's BoardEditor + CompetitionResults use for their 6×6
  boards) collapses to a 3-column grid so dice glyphs aren't
  squeezed below 50px on a 320px screen; `<input type="number">`
  caps at 56px so three steppers fit; `.label-caps` shrinks 1pt and
  tightens letter-spacing.
- **`prefers-reduced-motion`** — Phase 4 transitions, Compose
  collapse animations, and any `animation:` declaration get
  neutralized to 0.001ms duration.
- **Tarot + Comic contrast patches** — Tarot `text-ink-50` (muted
  tan secondary text on the navy paper) gets bumped to a paler
  cream so labels clear WCAG AA without losing the antique-mystic
  feel; Comic `text-accent-500` (primary blue on bright yellow,
  measured at ~3.4:1) defers to `--accent-600` (~5.1:1) so any
  link, footer caption, or hover-underline styled with the accent
  utility clears the floor. Both are per-utility overrides — the
  base `--ink-50` / `--accent-500` tokens are left alone because
  the heatmap palette derives from the same scale.

### A11y JSX additions (surgical)

In addition to the CSS-only block above, six small attribute-only
edits were applied to the most prominent interactive + status
surfaces (no markup restructured, no children touched, low collision
risk with the in-flight refactor):

- `web/src/features/compose/ComposeView.tsx` — Share button gets
  `aria-label="Share this competition plan as a URL"` +
  `aria-live="polite"` so the "✓ Link copied" / "Link in URL —
  copy failed" state changes are announced. Print button gets
  `aria-label="Print competition sheets, one board per page"`.
- `web/src/features/lookup/LookupView.tsx` — Print button gets
  `aria-label="Print this triple's solutions sheet"`. The
  `<Skeleton />` placeholder gains `role="status"` +
  `aria-live="polite"` + a descriptive `aria-label` so screen
  readers announce loading state.
- `web/src/features/compare/CompareView.tsx` — "Loading dice
  details…" placeholder gains `role="status"` + `aria-live="polite"`.
- `web/src/features/explore/ExploreView.tsx` — "Loading the
  index…" and "Loading solutions for …" placeholders gain
  `role="status"` + `aria-live="polite"`.
- `web/src/features/visualize/VisualizeView.tsx` — All three
  loading placeholders (index, target stats × 2) gain
  `role="status"` + `aria-live="polite"`.
- `web/src/features/gallery/GalleryView.tsx` — Per-card status
  region (`isLoading` / `hadError`) gains `role="status"` +
  `aria-live="polite"`.
- `web/src/app/App.tsx` — Suspense fallback for the lazy-loaded
  Æther view gains `role="status"` + `aria-live="polite"`.

`FavoriteToggle` (`web/src/ui/FavoriteToggle.tsx`) and the
Lookup target-strip already had `aria-label` / `aria-pressed` /
`role="group"` / `aria-current` from earlier phases — left
unchanged. The `AllEquationsList` loading state already had
`role="status"` + `aria-live="polite"` — left unchanged.

### Verification

- `npm run typecheck` (root) — clean.
- `npm --workspace web run typecheck` — clean (after deleting a
  stale `web/tsconfig.tsbuildinfo` that referenced pre-refactor
  CompareView shapes; `tsc -b`'s incremental cache had become out
  of sync with the live source).
- `npm test` (root) — **153/153**.
- `npm --workspace web run test` (new) — **40/40**.
- `npm --workspace web run build` — clean. Bundle delta:
  - JS: **400.84 → 410.30 KB raw** (+9.46 KB),
    **112.10 → 114.80 KB gzip** (+2.70 KB), 115 modules unchanged.
  - CSS: **80.76 → 89.08 KB raw** (+8.32 KB),
    **14.74 → 16.33 KB gzip** (+1.59 KB) — Herbarium variable
    bundle + treatments + the a11y/responsive block + the
    Tarot/Comic contrast patches.
  - Workers (`solverWorker`, `aetherSolverWorker`) unchanged at
    4.74 KB / 5.38 KB.

## Small bundle: bug fixes + drift cleanup

Tight, low-risk pass. No behavior changes any caller relied on; everything
here is either a confirmed bug fix, a comment correction, dead-code
removal, or a documentation refresh. All 153 tests green; both the root
`tsc` and `web/tsc -b` typechecks remain clean.

### Bug fixes (solver)

- **`src/services/boardAnalysis.ts`** — `bucketResults` now closes the
  final difficulty bucket on the right (`<= hi`), so a fully-impossible
  board (`boardDifficulty === 100`) is reported in `[80, 100]` instead
  of being silently dropped. Interior boundaries remain half-open so a
  triple is never double-counted. Added two regression tests in
  `tests/boardAnalysis.test.ts`: one for the 100 case, one to assert
  an interior boundary (e.g. 30) lands in exactly one bucket.
- **`src/services/arithmetic.ts`** — `applyOperator` now `throw`s on
  unknown operator codes, matching its JSDoc. Previously the unguarded
  `switch` returned `undefined` at runtime, contradicting the comment.
- **`src/cli/commands.ts`** — replaced the dead ternary
  ``[${diceMin > 20 ? 20 : 20}]`` in the export-dataset prompt with the
  static `[20]` it always meant.

### Comment / doc corrections

- **`src/services/difficulty.ts`** — `basesForDice` JSDoc claimed the
  fallback was `[d^0, d^1]`; the implementation actually returns
  `[d^0]` only. Comment updated to match (and to explain why the
  narrower fallback is intentional). No behavior change.

### Test hygiene

- **`tests/solver.test.ts`** — replaced a dead self-assertion
  (`expect(all[0]!.difficulty).toBe(all[0]!.difficulty)`) with a real
  cross-check that `easiestSolution`'s difficulty equals the minimum
  across `allSolutions`, computed via `difficultyOfEquation`.
- **`tests/bulkSolver.test.ts`** — fixed the off-by-one prose comment:
  the `[1,1,1]` triple reaches **five** trivial integer targets
  (`{-1, 0, 1, 2, 3}`), not four. Added the equation hints inline.

### Drift cleanup (web + README)

- **`web/src/features/about/AboutView.tsx`** — colophon prose no longer
  claims "three editions". Now derives the count dynamically from
  `THEME_IDS.length` (currently sixteen) and spells out the number,
  so the prose can never drift from the registry again.
- **`README.md`** — refreshed the editions section: explicit "sixteen
  editions" headline, kept Almanac / Phosphor / Risograph as the
  representative spotlight, then a one-line index of the other
  thirteen editions pointing at `docs/themes.md` and
  `web/src/core/themes.ts` for the canonical list.
- **`web/src/styles/globals.css`** — the file's top-of-file comment
  also said "three themes". Replaced with a pointer at `THEME_IDS`
  in `web/src/core/themes.ts` so the CSS doesn't have to re-list
  every edition.

### Repository hygiene

- **`tests/smoke-export.ts`** — deleted. Was a manual long-running
  smoke script duplicating `scripts/export-dataset.ts`, never picked
  up by `vitest run` (no `*.test.ts` suffix), and not referenced by
  any npm script or doc. Verified with `rg "smoke-export"` before
  deletion.
- **`docs/screens/`** — moved 66 root-level `*.png` reference
  screenshots out of the repository root and into `docs/screens/`.
  Added `docs/screens/README.md` describing the naming convention
  (`<edition-id>-<view-or-state>.png`), the two purposes (theme
  reference + eyeballable regression) and the refresh procedure.
  Files were moved with `Move-Item` rather than `git mv` because the
  repo's `.git` was locked at the time (`HEAD.lock` present); git's
  automatic rename detection on identical PNG content (100% similarity)
  will surface these as renames in the next `git status -M` /
  `git diff -M`, preserving effective history.

### Out of scope (intentionally deferred)

- ESLint flat config — would surface a large unbounded set of new
  findings and is not a fix.
- `web/src/stores/DataStore.ts` per-triple cache cap (LRU) — semantic
  change, not a bug.
- Re-running `npm run data:all` to align the on-disk manifest with
  the shipped `web/public/data/index.json` — produces large committed
  artifacts, not a refactor.

## Æther edition — initial implementation

Added an entire "advanced" / secret variant of the solver, gated behind
a Konami unlock on both CLI and web surfaces.

### Core (`src/core/`)

- **`n2kBinary.ts`** — custom `.n2k` binary file format with `BitReader`
  / `BitWriter`, three file kinds (Chunk, Index, Coverage), magic
  `N2K\0`, version 1. Hand-computed wire-format snapshot test.
- **`types.ts`** — added `Arity = 3 | 4 | 5` and `NEquation`.
- **`constants.ts`** — added `ADV_DICE_RANGE` (-10..32),
  `ADV_TARGET_RANGE` (1..5,000), `ADV_MAGNITUDE_CEIL` (1,000,000),
  `ADV_BASE_TWO_CAP` (2^20), `advMaxExponentFor`, `ADV_DIFFICULTY`
  weight bag.

### Services (`src/services/`)

- **`arithmetic.ts`** — added `evaluateLeftToRightN` with magnitude
  pruning, `permutations` (Heap's), `distinctPermutations` for
  multisets.
- **`advancedDifficulty.ts`** — sign-aware, magnitude-aware,
  arity-agnostic heuristic with smoothing and upper-tail compression.
- **`advancedParsing.ts`** — `formatNEquation` / `parseNEquation`
  handling `(-3)^4` and bare `-3^4`.
- **`advancedSolver.ts`** — `solveAdvancedForAllTargets`,
  `easiestAdvanced` (auto-arity), `solveOneTuple`,
  `enumerateUnorderedTuples`.
- **`advancedExporter.ts`** — `exportTupleAdvanced`,
  `ArityAggregator`, chunk filename helpers.

### CLI (`src/cli/`)

- **`secretState.ts`** — Konami detector for `UDUDLRLR`, case- &
  whitespace-tolerant, with `forceUnlock()` for tests.
- **`commands.ts`** — added hidden Command #10 (advanced on-demand
  solve); Command #9 now prompts for the advanced exporter when
  unlocked instead of blocking the REPL.
- **`repl.ts`** — wires `SecretState`, swaps prompt to
  `Æ Enter a command: ` once unlocked, filters hidden commands.

### Scripts

- **`scripts/advanced-worker.ts`** — `worker_threads` body that calls
  `exportTupleAdvanced` and posts back `chunkBytes.buffer` via transfer
  list.
- **`scripts/advanced-worker-bootstrap.mjs`** — JS shim that
  `register()`s `tsx/esm/api` inside the worker so TS imports resolve
  on Node 22.
- **`scripts/export-advanced.ts`** — CLI driver: spawns the worker
  pool, distributes tuples, aggregates per-arity, writes
  `chunks/`, `index.n2k`, `coverage.n2k`, and `manifest.json`.

### `package.json`

- New script `data:advanced` → `tsx scripts/export-advanced.ts`.

### Web (`web/src/`)

- **`stores/SecretStore.ts`** — MobX store with global keydown listener;
  detects ↑↑↓↓←→←→ba; exposes `unlocked`, `forceUnlock()`, `attach()`.
- **`stores/AppStore.ts`** — added `secret: SecretStore`; added
  `"aether"` to `View`; `setView("aether")` is a no-op while locked.
- **`ui/nav.ts`** — `useNavItems()` hook returns base nav, plus the
  `"Æ — Æther"` entry once unlocked. `NAV_ITEMS` kept as a back-compat
  re-export.
- **All 12 page-shell layouts** — switched from `NAV_ITEMS` constant
  import to `useNavItems()` hook so the secret entry appears in any
  active theme.
- **`ui/SecretBadge.tsx`** — observer component that renders a small
  ✦ glyph only while unlocked.
- **`ui/layouts/SidebarLayout.tsx`** — renders `<SecretBadge />` next to
  the edition name in the footer.
- **`services/aetherSolverWorker.ts`** — Vite Web Worker that calls
  `easiestAdvanced` from the shared algorithm code.
- **`services/aetherSolverService.ts`** — main-thread façade with a
  worker pool sized to `hardwareConcurrency - 1`.
- **`features/aether/AetherStore.ts`** — local UI state for the view:
  arity, dice, target, solve state, monotonic-id stale-reply guard.
- **`features/aether/AetherView.tsx`** — section page: arity picker,
  dice steppers, target input, solve button, result panel showing the
  chosen equation, arity, difficulty, and elapsed-ms.
- **`app/App.tsx`** — `AetherView` is `lazy()`-loaded so the advanced
  solver code stays out of the main bundle until the unlock fires.

### Tests

- `tests/n2kBinary.test.ts`, `tests/advancedArithmetic.test.ts`,
  `tests/advancedSolver.test.ts`, `tests/advancedExporter.test.ts`,
  `tests/secretState.test.ts` — all new, all passing.
- Full suite: 14 files / 151 tests ✓

### Verification

- `npm run typecheck` (root) ✓
- `npx tsc -b --noEmit` (web workspace) ✓
- `npx vite build` (web production) ✓
  - `AetherView` is its own lazy chunk (≈7.6 kB)
  - `aetherSolverWorker` is its own bundle (≈5.3 kB)
  - main bundle gzipped: ~112 kB
- `npx vitest run` ✓ — 151 / 151

### Notable decisions

- **Negative bases interpreted literally**: `(-3)^4 = 81`, parser/printer
  parenthesize negative bases.
- **Easiest-only export** to keep `.n2k` files small.
- **Worker bootstrap via `tsx/esm/api`** to dodge a Node 22 +
  `worker_threads` + `tsx` module-resolution bug.
- **Lazy nav hook over per-layout edits**: a single `useNavItems()` is
  the only nav contract; every layout opts in by calling the hook.
- **No `localStorage` persistence (yet)** of the unlock — keeps the
  surprise on every page load.
