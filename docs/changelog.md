# Changelog

Running log of session work.

## Unreleased — One-shot difficulty matrix for Compose

Generating Compose competitions with the **Extensive** pool used to
fan out ~1,501 lazy `dice/{a-b-c}.json` requests just to read one
number per (dice, target) pair — the per-dice chunks bundle full
equation strings that the competition resolver never reads. With the
12-wide worker pool and per-chunk JSON parsing, the wait climbed into
multi-second territory on first run and visibly scaled with the pool
size.

The fix is to precompute and bundle a flat difficulty matrix, then
load it once.

### New build artifact — `web/public/data/difficulty.json`

`{ totalMin, totalMax, dice: { "a-b-c": [d | null, …] } }` covering all
1,540 dice triples × 999 targets. Equation strings are dropped (Compose
never uses them; Lookup keeps loading per-dice chunks for those).

Sizes: 7.6 MB raw → ~880 KB gzip → ~540 KB brotli — i.e. one
sub-second fetch instead of 1,501 chained ones, and ~25× less wire
traffic once compressed.

Two emission paths so the artifact stays in sync with the canonical
pipeline AND can be regenerated against existing chunks:

- `scripts/prepare-web-data.ts` writes it during a full export
  alongside `index.json` / `by-target.json` / `target-stats.json`.
- `scripts/compute-difficulty-matrix.ts` is a standalone post-processor
  (mirrors `compute-target-stats.ts`) that walks `web/public/data/dice/`
  — useful when the chunks are already on disk. Wired up as
  `npm run data:matrix` and folded into `data:all`.

### Service / store — single fetch, cached for the page lifetime

- `DifficultyMatrix` joins `core/types.ts`.
- `datasetService.loadDifficultyMatrix()` fetches `data/difficulty.json`.
- `DataStore.difficultyMatrix` is a new `Loadable<DifficultyMatrix>`
  slice with `loadDifficultyMatrix()` matching the existing
  `loadIndex` / `loadByTarget` / `loadTargetStats` shape.

### Compose — switched off the chunk-fan-out path

- `competitionService.ts` is rewritten around the matrix:
  `makeDataStoreResolver` now reads from `dataStore.difficultyMatrix`
  (per-row dense array, `target - totalMin` index), and
  `ensureDifficultyMatrixLoaded` replaces `ensureCandidatesLoaded` /
  `MAX_PARALLEL_FETCHES`. The bounded worker pool, retry-on-`TypeError`
  loop, and per-dice progress accounting are gone — none of them are
  needed when there's a single fetch.
- `CompositionStore.generateAll` calls the new entrypoint; the
  `loadProgress` signal still drives the existing UI affordance but
  now toggles 0 → 1 instead of crawling.
- `ComposeView.tsx` Toolbar copy changed from
  `loading dice chunks · 42%` to `loading difficulty matrix…` (with
  `role="status" aria-live="polite"`).

### Verification

- `npm run typecheck` — clean (root + web workspace).
- `npm --workspace web run test` — 43/43 passing
  (`CompositionStore` round-trip suite untouched; the share-URL
  envelope is unchanged).
- `npm run data:matrix` regenerated `difficulty.json`: 1,540 dice ×
  999 targets, 371,989 solvable cells, 7.59 MB raw on disk.

## Unreleased — Æther mode visual signature + mode-aware almanac stats

The Konami unlock now reskins the entire almanac shell instead of only
swapping the per-tab content. Two surfaces changed: the dataset stats
strip every layout renders (Triples / Records / Targets / Compiled),
and the page chrome itself.

### Mode-aware almanac index — `useAlmanacIndex`

Standard mode reads four numbers off the precomputed
`DatasetIndex` (1,540 triples · 530,191 records · 1–999 · build date).
Æther mode has no on-disk index — it sweeps tuples on demand — so the
same shape is now synthesized on the fly:

- **Dice triples** → `AETHER_UNIVERSE_TUPLE_COUNT` = 1,711,314, the
  combinatorial count of unordered tuples across arities 3, 4, and 5
  drawn from the full `ADV_DICE_RANGE` (-10..32, 43 values). Computed
  once via `multisetCount(43, k)` for `k ∈ {3, 4, 5}`.
- **Records** → `AetherDataStore.cacheSize`, the live count of
  completed sweeps. Ticks up in real time as the user explores.
- **Targets** → `ADV_TARGET_RANGE` (1..5,000).
- **Compiled** → reuses the standard index's `generatedAt` so the
  date stays meaningful.

The new `web/src/stores/useAlmanacIndex.ts` hook returns a
`Loadable<DatasetIndex>` so all twelve layouts (`SidebarLayout`,
`ChartLayout`, `PanelsLayout`, `TopbarLayout`, `MarqueeLayout`,
`MagazineLayout`, `MapLayout`, `MasonryLayout`, `MetroLayout`,
`PolaroidLayout`, `SpreadsheetLayout`, `StackedLayout`,
`TickerLayout`) drop in unchanged — they each kept their existing
labels ("Routes" / "Records" / "RECS=" / etc.) and just swap the data
source.

### MobX wiring — `cacheSize` now observable

`AetherDataStore.sweepCache` is annotated `false` in
`makeAutoObservable` (Map mutations don't deep-track), so the existing
`cacheTick` counter is the only signal MobX can react to. The
`cacheSize` getter reads `void this.cacheTick;` before returning
`sweepCache.size` so MobX wires the dependency. Without that line the
"Records" stat in Æther mode froze at 0 — the bug surfaced live during
browser smoke-testing and the fix was verified by watching the count
tick from 0 → 1 → 2 as sweeps for `[2,3,5]` and `[2,3,5,7]` resolved.

### Page chrome — `<html data-aether="1">` overlay

`App` now mirrors `secret.aetherActive` onto the document element as
a `data-aether="1"` attribute (effect-driven, cleared on revert and
on unmount). `web/src/styles/globals.css` gained an overlay block
keyed off that attribute that:

- Shifts `--accent-*` toward cosmic violet (`#5e3aa6` / `#8c6bd4`)
  without touching paper / ink / oxblood, so every theme keeps its
  identity but signals Æther through accent shifts.
- Adds a faint indigo radial vignette + 96 px hairline grid to
  `body` for a "starfield + graph paper" texture.
- Wraps `.page-surface` in a soft violet halo plus a small "Æ"
  watermark in the top-right corner.
- Lights the active `SecretBadge` (`✦`) with a violet text-shadow.

The overlay is purely additive — exiting Æther mode removes the
attribute and every selector falls away cleanly with no theme
state to undo.

### Verification

- `npm --workspace web run typecheck` — clean.
- `npm --workspace web run test` — 43/43 passing.
- `npm --workspace web run build` — production bundle compiles clean.
- Browser smoke (cursor-ide-browser): Konami-unlocked Almanac
  edition, scrolled the sidebar to confirm the Æther stats block
  (1,711,314 / live records / 1–5000 / build date), drove an arity-4
  then arity-5 sweep and watched Records tick 1 → 2 in real time,
  visually confirmed violet accents on tabs / labels / the
  "Five thousand" italic in the H1 / the chosen target / adjacent
  bars, plus the page-surface halo and footer Æ glyph.

## Unreleased — Streaming partial sweeps for Æther Lookup

Arity-5 Æther sweeps brute-force ~5 billion equation candidates per
tuple — typically 1–3 minutes of wall-clock time even after the
worker-pool dispatch lands. The previous Lookup view rendered nothing
until the full sweep resolved, so users (correctly) read the multi-
minute spinner as a hang. The fix is to stream the running best-known
equation out of the worker as each permutation finishes, so the UI
shows a real answer within ~400 ms and tightens the difficulty score
as remaining permutations narrow it.

### Solver — opt-in per-permutation progress hook

`solveAdvancedForAllTargets` (`src/services/advancedSolver.ts`) now
accepts an optional `onPermComplete` callback that fires after each
permutation finishes enumerating, with the running best-so-far map and
`(permsDone / permsTotal)` counts. The callback path is purely
additive — existing callers (the bulk-export pipeline, the standalone
`easiestAdvanced`, every test) keep working unchanged because the
parameter is optional and the extra `[...distinctPermutations(dice)]`
materialization only happens when a caller passes it.

### Worker — throttled `sweep-progress` messages

`web/src/services/aetherSolverWorker.ts` wires that callback to a new
`sweep-progress` response kind. Emits are throttled to a 400 ms minimum
spacing (the first permutation always emits), so cheap arity-3 sweeps
(<1 s, 24 perms) don't flood postMessage while arity-5 sweeps (~120
perms over 1–3 minutes) get one update per perm. The shared
`rowsFromBest` helper extracted in this change also dedupes the
wire-format conversion previously inlined in the `sweep-ok` path.

### Service / store — partial cache, decoupled from `Loadable`

- `sweepAdvanced` (`web/src/services/aetherSolverService.ts`) takes an
  optional `onProgress` callback; the pool routes `sweep-progress`
  messages to it without resolving the request promise.
- `AetherDataStore` keeps a separate `partialCache` keyed by tuple,
  populated from progress and cleared when the final `ready` value
  lands. Exposed via a new `partialFor(tuple)` accessor that wires up
  a MobX dep on `cacheTick`. The existing `Loadable<AetherTupleSweep>`
  shape is unchanged so Compare / Visualize / Explore are not touched.

### Lookup view — `RunningSolution` panel

`AetherLookupView`'s `SolutionPanel` now prefers a partial sweep over
the skeleton when one exists. The new `RunningSolution` component:

- Renders the same `Equation` + `DifficultyMeter` + neighborhood strip
  as the final view, so there's no layout jump when the sweep
  resolves.
- Adds a "Running" badge with a pulsing dot and a thin progress bar
  showing `permsDone / permsTotal`, plus elapsed seconds and current
  solvable-targets count.
- Falls back to a "no equation reaches `<target>` yet" message when
  the partial map doesn't contain the user's selected target.

The neighborhood-strip rendering was extracted into a reusable
`NeighborhoodStripCore` so the partial path can drive it from the
streaming cell map.

### Skeleton copy

The "typically < 1 s for arity 3, a few seconds at arity 4 or 5"
warning was wildly optimistic and the main reason arity 5 looked
broken. Replaced with: "Warming up the Æther solver — first answer
should appear within a second or two; arity-5 sweeps continue refining
for 1–3 minutes." The skeleton itself only flashes for the first ~400
ms now (until the streaming partial arrives).

### Verification

- `npm run typecheck` (root) — clean.
- `npm --workspace web run typecheck` — clean.
- `npm test` — 153/153 passing.
- `npm --workspace web run test` — 43/43 passing (one pre-existing
  arity-mismatch in `tests/CompositionStore.test.ts` line 54 fixed
  along the way: `makeFakeResult(2)` → `makeFakeResult(2, 0)`).
- `npm --workspace web run build` — clean. Bundle:
  `index-*.js` 467.09 kB raw / 125.34 kB gzip,
  `aetherSolverWorker-*.js` 6.18 kB (was 5.77 kB).

### Out of scope, noted for follow-up

- The arity-5 sweep is still ~160 s on a fast laptop. Streaming makes
  it *responsive*, not *fast*. The next lever is parallelizing one
  sweep across the worker pool by partitioning the permutation list
  (5! = 120 perms ÷ 8 cores ≈ 15 perms each → ~20 s total).
- A "stop solving" button would be nice for users who change the dice
  mid-sweep at arity 5; currently the worker keeps running until done
  and just discards the result. `MessageChannel`-based cancellation
  was already noted in `AetherDataStore`'s class comment.

## Unreleased — Compose: shared link includes the rolled boards, lands on the Compose tab

Reported behaviour: copy-pasting a "Share plan" URL into a fresh browser
opened the default Lookup tab and, even after navigating to Compose,
showed empty boards — the recipient had to click *Generate* and (with
no shared seed) saw a different competition than the sender did.

Two root causes:

1. The shared payload (`SharedPlanV1`) only carried the **inputs** —
   board kind, range, multiples, pinned overrides, candidate pool, time
   budget, optional seed. The `preview` (rolled cells) and `result`
   (`BalancedRollsResult` with per-round dice and totals) were
   deliberately omitted "since seeded runs reproduce them". They don't,
   when no seed is set.
2. The presence of a `#plan=` hash had no effect on the initial view —
   `AppStore.view` defaulted to `"lookup"`, and the Compose-side
   `loadFromUrl` only ran once the user manually opened that tab.

Fixes:

- **`web/src/features/compose/CompositionStore.ts`** — bumped the share
  envelope to `SharedPlanV2`. Each board may optionally carry its
  generated `preview: number[]` and `result: BalancedRollsResult`.
  `snapshot()` writes them in lockstep with the live store; ungenerated
  boards stay byte-for-byte the same as v1, so a "share before
  generating" link keeps the small payload. `applySnapshot()` accepts
  both v1 (legacy permalinks, status stays `"idle"`) and v2 (status
  flips to `"ready"` per board, results render immediately).
- **`web/src/app/App.tsx`** — at boot, before the view tree mounts, if
  `window.location.hash` matches `(^|&)plan=` the root store snaps
  `view = "compose"`. Pasting a shared link now routes straight to
  Compose with no flash of the default page.
- **`web/tests/CompositionStore.test.ts`** — replaced the now-stale
  "envelope excludes preview/result" assertion with a per-field
  `not.toHaveProperty` check (compactness preserved for ungenerated
  boards). Added a v2 round-trip test asserting cells, per-round dice,
  and the headline `expectedScoreDelta` survive the URL trip, plus a
  v1 back-compat test ensuring legacy links still load and leave
  boards in `"idle"` state.

Technical notes:

- A `BalancedRollsResult` is plain data (no class instances, no
  `Map`s), so the existing JSON → DEFLATE-RAW → base64url codec
  handles it losslessly. A 4-board × 4-round plan adds ~700 bytes
  after compression — well inside the practical URL budget. Bundle
  size grew ~13 KB un-gzipped from the new types + helper.
- The display path (`CompetitionResults`) reads only `board.preview`,
  `board.result`, and `board.overrides`. None of those need the
  dataset, the resolver, or a worker, so a v2 paste-load shows the
  full competition immediately — no chunk fetches, no progress bar.
- Schema versioning is opt-in per feature (each `HashSchema` owns its
  own version prefix), so this bump is invisible to other features
  that share the URL hash.

## Unreleased — Dice-roll legality rule: no more than one `1`

Previously the only roll-legality rule the codebase enforced was the
classic "no all-same triples" rule (e.g. `(5, 5, 5)`). The game also
forbids rolls with two or more `1`s — `(1, 1, 1)`, `(1, 1, 4)`, `(7, 1, 1)`,
etc. — because two `1`s leave the third die effectively alone after
multiplication or division by 1, so the roll never produces an
interesting equation. Triples with exactly one `1` (e.g. `(3, 3, 1)`)
remain legal.

The rule is now codified once and applied at every triple-generation
site:

- `src/core/constants.ts`: new `isLegalDiceTriple(triple)` predicate
  enforces both rules in one place.
- `src/services/exporter.ts`: new `enumerateLegalDiceTriples(min, max)`
  wraps `enumerateUnorderedTriples` with the legality filter;
  `exportAllSolutions` now uses it, so future NDJSON exports skip
  illegal rolls. The pure `enumerateUnorderedTriples` math primitive
  is unchanged so the existing `1540` invariant test still holds.
- `src/services/generators.ts`: `generateRandomDice` now re-rolls until
  the result satisfies `isLegalDiceTriple` (was: until not all-same).
- `web/src/services/candidatePools.ts`: `buildExtensive` (the Compose
  "Extensive" pool) uses the same predicate. Pool size dropped from
  1,520 to 1,501 (1,540 unordered triples in `[1, 20]` minus 20
  all-same minus 19 additional `(1, 1, c)` triples). The pool's
  visible label was updated to `Extensive (1,501)`.

Tests:

- `tests/exporter.test.ts`: added an `enumerateLegalDiceTriples` block
  asserting the new counts (13 over `[1, 4]`, 1,501 over `[1, 20]`).
  Updated the `onProgress` invocation count for the `[2, 3]` export
  fixture from 4 → 2 (only `(2, 2, 3)` and `(2, 3, 3)` remain legal).
- All 155 root tests + 43 web tests + web typecheck pass.

Notes / followups:

- The shipped `n2k-export.ndjson` still contains the 20 illegal
  triples until the next bulk re-export. Runtime callers (Compose
  pool, random roller) already skip them, so the user-visible UI is
  consistent today; the dataset will catch up the next time someone
  runs `exportAllSolutions`.
- The Standard 38-triple pool (`DICE_COMBINATIONS`) and the Æther
  arity-3 sample (`AETHER_SAMPLE`) both start at dice value 2, so
  neither one was affected by the new rule.

## Unreleased — Compose: bound concurrency when loading the Extensive candidate pool

Generating a competition with the **Extensive (1,540)** pool was
intermittently failing with `Dice 12-15-15 failed to load: TypeError:
Failed to fetch` (or a different triple — whichever socket the browser
happened to drop). The chunk *exists* on disk; the failure was purely
transport. Two compounding issues:

1. `ensureCandidatesLoaded` (`web/src/services/competitionService.ts`)
   fired all 1,540 `dataStore.ensureDice` calls in a tight loop, so
   the browser tried to open ~1,540 simultaneous fetches against the
   same origin. Beyond the per-host connection cap the sockets queue,
   and under load some get aborted with a bare `TypeError: Failed to
   fetch` (no HTTP status — the request never made it out). One bad
   socket would then poison the whole generation because the polling
   loop rejects on the first `error` state.
2. `datasetService.loadDice`
   (`web/src/services/datasetService.ts`) had no retry, so a transient
   transport hiccup was fatal.

Fixes:

- **Bounded worker pool.** `ensureCandidatesLoaded` now spins up
  `MAX_PARALLEL_FETCHES = 12` workers that pull from a shared cursor
  over the candidate list. Each worker awaits its own dice chunk
  (cache-checks first, so already-loaded triples cost nothing) before
  picking the next one. Throughput is unchanged in practice (the
  browser was already serializing past ~6) but socket pressure stays
  bounded and `onProgress` ticks reflect real completions instead of
  jumping at the end.
- **Transient retries at the service layer.** `fetchJsonWithRetry`
  retries up to 3 times on `TypeError` (i.e. transport failures) with
  100ms / 200ms backoff. HTTP error responses (404 etc.) are *not*
  retried — those signal a missing chunk and should fail loudly.

Net effect: the Extensive pool now loads reliably even on a cold
cache, and Compose's "Generate score-balanced rolls" no longer
errors halfway through.

## Unreleased — Compose: tighten the printed board sheet so it fits one page

Follow-up to the previous fix. With the 6×6 grid restored, each
`.compose-board-sheet` was still ~10in tall on paper because the
on-screen sizes stayed in effect: board cells were `h-12`, the rounds
table used `py-2` rows, and the totals block was a 2/4-column CSS
grid. The result was every board spilling onto a second page that
held only the totals strip — followed by a forced page break for the
next board. So a 2-board competition printed as 5 pages with two
near-empty ones in the middle.

This pass adds compose-scoped print overrides in
`web/src/styles/globals.css` (inside the existing `@media print` block):

- Board cells drop to `padding: 3pt 0` and `font-size: 9pt` so the
  6 rows fit in a couple of inches instead of half a page.
- Rounds table cells get `padding: 2pt 0`; table font drops to 9pt.
- Totals block becomes a single horizontal flex strip ("P1 totals ·
  P2 totals · Δ expected score · Δ difficulty") rather than a 2/4-col
  grid, so the footer reads as one line.
- Difficulty meter unfilled pips are re-skinned from
  `bg-ink-100/15` (which printed as faint ghost rectangles) to
  hairline outlined boxes, with filled pips locked to solid black.
- Header `.font-display` ramps down to 14pt so the "Random 1–200"
  / "Pattern [6] start 6" titles don't dominate the sheet.

Net effect: a 4-round board on US Letter (portrait or landscape)
prints as a single page, and a multi-board competition gets exactly
one page per board.

## Unreleased — Compose: fix "Print boards" collapsing the 6×6 grid

The print stylesheet in `web/src/styles/globals.css` includes a blanket
`.grid { display: block !important; }` rule (around line 2359) so the
12-column page scaffolding flattens cleanly on paper. That same rule
also flattened the 6×6 board grid inside each printed competition
sheet, so Chrome's print preview rendered the board as a single
vertical ribbon of cell values (empty cells still occupied `h-12`,
producing the long, sparse "1, 5, 15, 24, 26, 28, …" stack the user
reported).

Fix:

- `web/src/features/compose/CompetitionResults.tsx`: tagged the inner
  6×6 `<div>` in `BoardGrid` with a stable `compose-board-grid`
  class so it can be selected without depending on the inline
  `grid-template-columns` style attribute.
- `web/src/styles/globals.css`: added a `@media print` rule that
  re-enables `display: grid` for `.compose-board-grid`, scoped
  narrowly so the 12-col page scaffolding still collapses to block
  flow but the board itself prints as a 6×6 grid again.

No other behaviour changes. Lookup print sheet was already untouched
by the rule (it doesn't use `.grid` for its layout).

## Unreleased — Æther mode integration across every standard view

The Æther variant — originally a single hidden `AetherView` page added
on Konami unlock — has been folded into every standard view as a
behaviour mode rather than a separate tab. The standalone tab is gone;
the same nav now drives both modes, and the `secret.aetherActive` flag
on `SecretStore` decides which renderer the four data-bearing views
use.

### Per-view delegation

Each of the four standard views grew a thin `observer` wrapper that
inspects `secret.aetherActive` and returns the matching Æther variant
when active. The standard implementation is unchanged and re-exported
under a `Standard…View` name so the rest of the app can keep importing
the canonical entry point:

- `web/src/features/lookup/LookupView.tsx` → `AetherLookupView`
- `web/src/features/explore/ExploreView.tsx` → `AetherExploreView`
- `web/src/features/compare/CompareView.tsx` → `AetherCompareView`
- `web/src/features/visualize/VisualizeView.tsx` → `AetherVisualizeView`

Æther variants live next to their standard counterparts (same folder,
`Aether*` prefix) so feature ownership stays in one place. Each Æther
view talks to the on-demand worker pool via `AetherDataStore` and
keeps its own per-feature UI store (`AetherCompareStore`,
`AetherExploreStore`) for state that is meaningfully different from the
standard sibling (arity filter, sweep cache, tuple search, etc.).

### `web/src/services/aetherSample.ts` (new)

Canonical 1,000-tuple Æther sample shared between Explore, Visualize,
Compare, and Compose so every Æther surface operates on the same
substrate. Built once at module load; arities 3/4/5 are mixed in fixed
proportions.

### `web/src/services/candidatePools.ts` + `web/src/features/compose/ComposeView.tsx`

- New `AETHER_CANDIDATE_POOLS` exposing an `aetherSample` pool — the
arity-3 slice of `AETHER_SAMPLE`, restricted to dice in `[1, 20]`
so it remains compatible with the bundled stats dataset that
Compose evaluates against.
- `ComposeView` appends the Æther pools to its picker only when
`secret.aetherActive`, and renders an `AetherNotice` aside
explaining why wider Æther tuples (negatives, values > 20) are not
selectable in Compose.

### `web/src/ui/nav.ts`

The standalone `"Æ — Æther"` nav entry was retired. `useNavItems()`
now always returns `BASE_NAV_ITEMS`; the hook is kept (rather than
inlining `NAV_ITEMS`) so future per-mode nav variations have a single
extension point.

### Verification

- `npm --workspace web run typecheck` — clean.
- `npm --workspace web run test` — 40/40 passing.
- **Browser smoke test (cursor-ide-browser, all five tabs)** — Konami
  unlock fires `SecretBadge` (✦), then each tab swaps to its Æther
  variant. Confirmed: Lookup arity picker + 1..5,000 target input,
  Explore search box accepting `2 3 5`, Compare manual `+ Add` flow
  with chart-mode selector and per-tuple chart series, Visualize
  single-tuple band controls + sampled-atlas size pickers, Compose
  Æther note banner + new `Æther sample (3d)` pool option. Zero
  console errors across all five tabs.

## Unreleased — Tabletop responsive audit (320–1920) + Visualize chart color fix

Walked the Tabletop edition through nine viewports (1920×1080, 1440×900,
1280×720, 1024×768, 768×1024, 414×896, 375×667, 320×568) covering every
view (Lookup, Explore, Compare, Visualize, Compose, Gallery, Colophon).
All Phase 7 narrow-viewport patches held — the navy frame, hard-edged
cards, fluid `clamp()` headings, and 6×6 board grid all behave from
tablet down to the iPhone SE. Two real bugs surfaced and were fixed:

### `web/src/features/visualize/VisualizeView.tsx` and `web/src/features/visualize/AetherVisualizeView.tsx`

- **Invisible solver-count histogram and Coverage atlas in Tabletop** —
three call sites built inline `background`/`stroke` strings against
the legacy `--oxblood-500` CSS variable (a holdover from when the
Almanac theme was the only one). Themes were renamed to
`--accent-500` / `--support-500` long ago, and Tailwind classes
(`bg-oxblood-500`) still resolve via `tailwind.config.js`, but the
hand-built strings did not. Result: in every theme that did not also
define `--oxblood-500` (i.e. all of them except Almanac), the
"How many triples solve each target" mini-histogram and the
Coverage-mode atlas grid rendered transparent — visible only as a
caption with empty space above it. The avg-difficulty polyline in
the Aether layout had the same bug. All three references now use
`--accent-500`, which every theme defines.

### `web/src/features/gallery/GalleryView.tsx`, `web/src/ui/nav.ts`, `web/src/styles/globals.css`, `web/index.html`

- **Hard-coded "Sixteen editions" headline** — Phase 7 added the
Herbarium edition, bringing the count to seventeen, but the Gallery
page header, the nav subtitle, and two source comments still said
"Sixteen". `GalleryView` now derives the spelled-out count from
`THEME_IDS.length` via an `EDITION_COUNT_WORDS` table (mirrors
`AboutView`), capitalising the first letter so the Tabletop theme's
global `text-transform: uppercase` on `h1` keeps working. The nav
subtitle becomes the version-agnostic "Every edition, side by side";
the comments now reference "every registered edition (see THEME_IDS)".

## Unreleased — Visualize + Explore polish: aligned coverage lists, sparkline fix, easiest/hardest split

Three small but visible polish passes following the Compare-view chart-modes
work. Each was driven by a real screenshot of clipped/misaligned content,
not a hypothetical concern.

### `web/src/features/visualize/VisualizeView.tsx`

- **Sparkline cards** — the per-triple cards in `Per-triple sparklines`
packed `[★] [dice] AVG x.x · n/999` onto a single flex row. At three-
and four-up grid widths, the trailing "999" was being clipped by the
card's right edge ("…/99"). Split the row: dice + star stay on the
first line, the readout drops to its own line below with
`whitespace-nowrap` + `overflow-hidden text-ellipsis`. Also wrapped
the solvable count in a `tabular` span so the digit width matches the
avg readout.
- **Coverage gaps** — the side-by-side `Most fragile targets`
(text-only, 10 rows) and `Triples with the worst coverage`
(dice-glyph rows, 8 rows) lists used different counts and
intrinsically different row heights, so the columns ended at
different y positions. Set both lists to `COVERAGE_LIST_LEN = 8`
and gave each `<li>` `min-h-[2rem]` so the text rows match the
dice-glyph rows visually.

### `web/src/features/explore/ExploreView.tsx`

- **Drilldown panel** — the per-triple aside used to be `Cleanest equations` (top 12 by ascending difficulty). User feedback: only
ever showing the easy end hides half the story. Replaced the single
ordered list with a `Top 8 easiest` / `Top 8 hardest` two-column
grid (single column under `xl:`, two columns above), sharing one
`DrilldownColumn` helper. Section heading became `Easiest & hardest`
and the page-header dek now reads "drill in to read each triple's
easiest and hardest equations side by side." Compare button + the
`n solvable · n impossible` summary line are unchanged.

### Verification

- `npm --workspace web run typecheck` — clean.
- `npm --workspace web run test` — 40/40 passing.
- `npm --workspace web run build` — clean (`index-*.js` 422.92 kB
gzipped 117.13 kB; bundle delta is the inline split-list helper, no
measurable impact).
- Manual: confirmed the sparkline header now shows the full `n/999`
in the 3- and 4-up grid; confirmed both coverage-gap columns end on
the same y baseline at sm:grid-cols-2 with 8 dice-glyph rows on the
right; confirmed the Explore dek text update rendered.

## Compare view: chart modes + richer stats

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
- `**prefers-reduced-motion`** — Phase 4 transitions, Compose
collapse animations, and any `animation:` declaration get
neutralized to 0.001ms duration.
- **Tarot + Comic contrast patches** — Tarot `text-ink-50` (muted
tan secondary text on the navy paper) gets bumped to a paler
cream so labels clear WCAG AA without losing the antique-mystic
feel; Comic `text-accent-500` (primary blue on bright yellow,
measured at ~~3.4:1) defers to `--accent-600` (~~5.1:1) so any
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

- `**src/services/boardAnalysis.ts`** — `bucketResults` now closes the
final difficulty bucket on the right (`<= hi`), so a fully-impossible
board (`boardDifficulty === 100`) is reported in `[80, 100]` instead
of being silently dropped. Interior boundaries remain half-open so a
triple is never double-counted. Added two regression tests in
`tests/boardAnalysis.test.ts`: one for the 100 case, one to assert
an interior boundary (e.g. 30) lands in exactly one bucket.
- `**src/services/arithmetic.ts**` — `applyOperator` now `throw`s on
unknown operator codes, matching its JSDoc. Previously the unguarded
`switch` returned `undefined` at runtime, contradicting the comment.
- `**src/cli/commands.ts**` — replaced the dead ternary
`[${diceMin > 20 ? 20 : 20}]` in the export-dataset prompt with the
static `[20]` it always meant.

### Comment / doc corrections

- `**src/services/difficulty.ts**` — `basesForDice` JSDoc claimed the
fallback was `[d^0, d^1]`; the implementation actually returns
`[d^0]` only. Comment updated to match (and to explain why the
narrower fallback is intentional). No behavior change.

### Test hygiene

- `**tests/solver.test.ts**` — replaced a dead self-assertion
(`expect(all[0]!.difficulty).toBe(all[0]!.difficulty)`) with a real
cross-check that `easiestSolution`'s difficulty equals the minimum
across `allSolutions`, computed via `difficultyOfEquation`.
- `**tests/bulkSolver.test.ts**` — fixed the off-by-one prose comment:
the `[1,1,1]` triple reaches **five** trivial integer targets
(`{-1, 0, 1, 2, 3}`), not four. Added the equation hints inline.

### Drift cleanup (web + README)

- `**web/src/features/about/AboutView.tsx`** — colophon prose no longer
claims "three editions". Now derives the count dynamically from
`THEME_IDS.length` (currently sixteen) and spells out the number,
so the prose can never drift from the registry again.
- `**README.md**` — refreshed the editions section: explicit "sixteen
editions" headline, kept Almanac / Phosphor / Risograph as the
representative spotlight, then a one-line index of the other
thirteen editions pointing at `docs/themes.md` and
`web/src/core/themes.ts` for the canonical list.
- `**web/src/styles/globals.css**` — the file's top-of-file comment
also said "three themes". Replaced with a pointer at `THEME_IDS`
in `web/src/core/themes.ts` so the CSS doesn't have to re-list
every edition.

### Repository hygiene

- `**tests/smoke-export.ts**` — deleted. Was a manual long-running
smoke script duplicating `scripts/export-dataset.ts`, never picked
up by `vitest run` (no `*.test.ts` suffix), and not referenced by
any npm script or doc. Verified with `rg "smoke-export"` before
deletion.
- `**docs/screens/**` — moved 66 root-level `*.png` reference
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

- `**n2kBinary.ts**` — custom `.n2k` binary file format with `BitReader`
/ `BitWriter`, three file kinds (Chunk, Index, Coverage), magic
`N2K\0`, version 1. Hand-computed wire-format snapshot test.
- `**types.ts**` — added `Arity = 3 | 4 | 5` and `NEquation`.
- `**constants.ts**` — added `ADV_DICE_RANGE` (-10..32),
`ADV_TARGET_RANGE` (1..5,000), `ADV_MAGNITUDE_CEIL` (1,000,000),
`ADV_BASE_TWO_CAP` (2^20), `advMaxExponentFor`, `ADV_DIFFICULTY`
weight bag.

### Services (`src/services/`)

- `**arithmetic.ts**` — added `evaluateLeftToRightN` with magnitude
pruning, `permutations` (Heap's), `distinctPermutations` for
multisets.
- `**advancedDifficulty.ts**` — sign-aware, magnitude-aware,
arity-agnostic heuristic with smoothing and upper-tail compression.
- `**advancedParsing.ts**` — `formatNEquation` / `parseNEquation`
handling `(-3)^4` and bare `-3^4`.
- `**advancedSolver.ts**` — `solveAdvancedForAllTargets`,
`easiestAdvanced` (auto-arity), `solveOneTuple`,
`enumerateUnorderedTuples`.
- `**advancedExporter.ts**` — `exportTupleAdvanced`,
`ArityAggregator`, chunk filename helpers.

### CLI (`src/cli/`)

- `**secretState.ts**` — Konami detector for `UDUDLRLR`, case- &
whitespace-tolerant, with `forceUnlock()` for tests.
- `**commands.ts**` — added hidden Command #10 (advanced on-demand
solve); Command #9 now prompts for the advanced exporter when
unlocked instead of blocking the REPL.
- `**repl.ts**` — wires `SecretState`, swaps prompt to
`Æ Enter a command:`  once unlocked, filters hidden commands.

### Scripts

- `**scripts/advanced-worker.ts**` — `worker_threads` body that calls
`exportTupleAdvanced` and posts back `chunkBytes.buffer` via transfer
list.
- `**scripts/advanced-worker-bootstrap.mjs**` — JS shim that
`register()`s `tsx/esm/api` inside the worker so TS imports resolve
on Node 22.
- `**scripts/export-advanced.ts**` — CLI driver: spawns the worker
pool, distributes tuples, aggregates per-arity, writes
`chunks/`, `index.n2k`, `coverage.n2k`, and `manifest.json`.

### `package.json`

- New script `data:advanced` → `tsx scripts/export-advanced.ts`.

### Web (`web/src/`)

- `**stores/SecretStore.ts**` — MobX store with global keydown listener;
detects ↑↑↓↓←→←→ba; exposes `unlocked`, `forceUnlock()`, `attach()`.
- `**stores/AppStore.ts**` — added `secret: SecretStore`; added
`"aether"` to `View`; `setView("aether")` is a no-op while locked.
- `**ui/nav.ts**` — `useNavItems()` hook returns base nav, plus the
`"Æ — Æther"` entry once unlocked. `NAV_ITEMS` kept as a back-compat
re-export.
- **All 12 page-shell layouts** — switched from `NAV_ITEMS` constant
import to `useNavItems()` hook so the secret entry appears in any
active theme.
- `**ui/SecretBadge.tsx`** — observer component that renders a small
✦ glyph only while unlocked.
- `**ui/layouts/SidebarLayout.tsx**` — renders `<SecretBadge />` next to
the edition name in the footer.
- `**services/aetherSolverWorker.ts**` — Vite Web Worker that calls
`easiestAdvanced` from the shared algorithm code.
- `**services/aetherSolverService.ts**` — main-thread façade with a
worker pool sized to `hardwareConcurrency - 1`.
- `**features/aether/AetherStore.ts**` — local UI state for the view:
arity, dice, target, solve state, monotonic-id stale-reply guard.
- `**features/aether/AetherView.tsx**` — section page: arity picker,
dice steppers, target input, solve button, result panel showing the
chosen equation, arity, difficulty, and elapsed-ms.
- `**app/App.tsx**` — `AetherView` is `lazy()`-loaded so the advanced
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

