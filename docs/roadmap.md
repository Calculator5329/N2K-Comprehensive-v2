# N2K Comprehensive Solver — Roadmap

High-level goals and feature list. Tasks are checked off as they ship.

## Standard mode (3 dice, targets 1–999)

- [x] Brute-force solver with parenthesis-free left-to-right evaluation
- [x] CLI REPL (commands #1–#9: lookup, all-equations, board difficulty,
      bulk dataset export, etc.)
- [x] Bulk export → JSON pipeline for the web Almanac
- [x] Web Almanac with Lookup, Explore, Compare, Visualize, Compose, About
- [x] Theme system (17 visual editions with custom layouts)
- [x] On-demand "all equations" Web Worker for the Lookup page

## Web upgrade Phase 7 — Polish (tests + theme kit + a11y)

A polish pass deliberately scoped as additive work so it doesn't
collide with an in-flight refactor pass on the component layout.
See `docs/current_task.md` for the per-track plan and
`docs/changelog.md` for the implementation log.

- [x] **Web test suite** (`web/tests/`, `web/vitest.config.ts`,
      `npm run test:web`) — `happy-dom`-backed vitest project
      covering the data-shape contracts most likely to silently
      drift: `compressedHashCodec`, `urlHashState`, `FavoritesStore`,
      `CompositionStore` snapshot/applySnapshot/share-URL
      round-trip, theme registry consistency. 40 tests, all green.
- [x] **17th edition — Herbarium** (`web/src/core/themes.ts`,
      `web/src/styles/globals.css`, `web/index.html`,
      `web/src/ui/nav.ts`) — Edwardian botanical specimen ledger.
      Sage + cream + vermilion specimen-tag accent. Reuses
      `sidebar` layout, `tile` glyph, `rendered` equation; uses
      already-loaded fonts. Smallest-footprint addition possible
      (Layers 1 + 2 only) — the canonical example for new
      contributors.
- [x] **Theme contribution kit refresh** (`docs/themes.md`) — the
      recipe doc now references the new vitest registry-consistency
      tests as the CI gate for the four-step recipe.
- [x] **Accessibility + responsive audit** (`web/src/styles/globals.css`
      + 7 surgical JSX edits across `App.tsx`, `LookupView.tsx`,
      `CompareView.tsx`, `ExploreView.tsx`, `VisualizeView.tsx`,
      `ComposeView.tsx`, `GalleryView.tsx`) — appended (post-print)
      CSS block adding a universal `:focus-visible` ring with
      theme-aware fallback colors, contrast nudges on the muted-ink
      scale for Phosphor + Arcade, per-utility contrast patches for
      Tarot (muted tan secondary text) and Comic (accent-blue
      links), a `<400px` viewport pass that collapses 6×6 board
      grids to 3×N and shrinks oversized number inputs, a 32px
      touch-target floor on coarse pointers, and a
      `prefers-reduced-motion` neutralizer for the Phase 4
      transitions. JSX edits limited to attribute-only additions
      (`aria-label` on Share / Print buttons, `role="status"` +
      `aria-live="polite"` on every loading placeholder) so they
      compose cleanly with the in-flight layout refactor.

## Æther edition (advanced mode — secret)

A larger, slower variant of the solver gated behind a Konami unlock.

- [x] **Constants & types** — `ADV_DICE_RANGE` (-10..32), `ADV_TARGET_RANGE`
      (1..5,000), `ADV_MAGNITUDE_CEIL` (1,000,000), `ADV_BASE_TWO_CAP`
      (2^20), `Arity = 3 | 4 | 5`, `NEquation`
- [x] **Generalized arithmetic** — `evaluateLeftToRightN`,
      `permutations` / `distinctPermutations`, magnitude pruning
- [x] **Advanced solver** — auto-arity (3 → 4 → 5) easiest-first search,
      `solveAdvancedForAllTargets`, `easiestAdvanced`, `solveOneTuple`
- [x] **Difficulty heuristic** — sign-aware, magnitude-aware,
      arity-agnostic `advDifficultyOfEquation`
- [x] **N-arity parsing** — `formatNEquation` / `parseNEquation`
      (handles `(-3)^4` and bare `-3^4`)
- [x] **Custom binary file format** — `.n2k` chunks / index / coverage
      with `BitReader` / `BitWriter` for compact bit-packed storage
- [x] **Worker-pool bulk exporter** — `scripts/export-advanced.ts`,
      `scripts/advanced-worker.ts`, dice-range / target-range CLI flags
- [x] **CLI Konami unlock** — `SecretState`, `UDUDLRLR` trigger,
      hidden Command #10 (advanced solve), advanced exporter prompt
- [x] **Web Konami unlock** — `SecretStore`, ↑↑↓↓←→←→ba detector
- [x] **Web Æther view** — arity picker, dice steppers, target input,
      worker-pool advanced solver, lazy code-split bundle
      *(retired in the all-tabs Æther integration — see below)*
- [x] **Footer ✦ glyph** — visible indicator while unlocked
- [x] **All-tabs Æther integration** — Æther mode is now a global UI
      state (`SecretStore.mode`) that swaps every primary view
      (Lookup / Explore / Compare / Visualize / Compose) for an
      Æther-aware variant on activation. The standalone Æther tab
      retired; the nav badge ✦/✧ is the toggle.
  - [x] **Per-tuple sweep worker** (`aetherSolverWorker.ts`,
        `aetherSolverService.sweepAdvanced`) — single-pass solve over
        every target in `[1, 5,000]` for a fixed-arity tuple.
  - [x] **`AetherDataStore`** — lazy per-tuple sweep cache + summary
        derivation, dedupes concurrent requests.
  - [x] **`AetherLookupView`** — arity picker, wider dice/target
        ranges, worker-backed solutions + neighborhood strip.
  - [x] **`AetherExploreView`** — paginated table over the canonical
        1,000-tuple sample, search box for ad-hoc tuples, sortable
        columns, click-to-detail panel.
  - [x] **`AetherCompareView`** — up-to-four tuples of any arity,
        same chart projections as the standard view, live worker
        sweeps with deduped cache.
  - [x] **`AetherVisualizeView`** — single-tuple difficulty band +
        opt-in sampled atlas with progress bar.
  - [x] **`Compose` Æther sample pool** — `aetherSample` candidate
        pool option + Æther-mode banner explaining the dataset
        constraint.
  - [x] **Mode toggle** — `SecretBadge` is now a button: ✧ unlocked
        but inactive, ✦ active. Click to flip.
- [ ] **Web Lookup pane backed by `.n2k` files** — chunk loader,
      coverage index, in-bundle lazy fetching (deferred until a real
      dataset is exported and we know the size budget)

## Future / nice-to-have

- [x] Compare view chart projections (per-target / avg-per-100 /
      solvable-per-100 / cumulative) + median + difficulty-mix bar
- [x] Compose: single-fetch difficulty matrix (`data/difficulty.json`)
      so the Extensive pool no longer fans out ~1,500 chunk requests
- [ ] Persist Konami-unlock in `localStorage` so reload keeps Æther on
- [ ] URL-hash sync for Æther view (so Æther links can be shared)
- [ ] Footer ✦ glyph in every layout (currently Sidebar only)
- [ ] Browser tests for `SecretStore` + `AetherStore`
