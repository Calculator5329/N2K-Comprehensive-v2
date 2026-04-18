# Current task — Æther mode visual signature + mode-aware almanac stats

Status: **DONE** (2026-04-18)

## Summary

The Konami unlock now reskins the entire almanac shell, not just the
per-tab content. Two surfaces changed:

1. The dataset stats strip every layout renders
   (Triples / Records / Targets / Compiled) now pulls from a synthetic
   `DatasetIndex` when `secret.aetherActive` is true.
2. The page chrome itself picks up an Æther-only style overlay,
   layered on top of whichever theme is active.

## What shipped

### Mode-aware almanac index — `useAlmanacIndex`

New hook at `web/src/stores/useAlmanacIndex.ts` that returns a
`Loadable<DatasetIndex>`:

- **Standard mode** → returns `data.index` unchanged (the on-disk
  precomputed index).
- **Æther mode** → returns a synthetic ready envelope with:
  - `diceTriplesTotal` = `AETHER_UNIVERSE_TUPLE_COUNT` = **1,711,314**
    (combinatorial tuple count across arities 3, 4, 5 over the full
    `ADV_DICE_RANGE` of 43 values, computed via `multisetCount(43, k)`).
  - `recordsWritten` = `AetherDataStore.cacheSize` (live tick).
  - `totalMin`/`totalMax` = `ADV_TARGET_RANGE` (1..5,000).
  - `diceMin`/`diceMax` = `ADV_DICE_RANGE` (-10..32).
  - `generatedAt` reused from the standard index (or now()).

All twelve layouts swapped from `store.data.index` to the hook with
zero label changes — each kept its own copy ("Records" / "Routes" /
"RECS=" / "Logged" / etc.) and just swapped the data source.

### MobX observability fix

`AetherDataStore.cacheSize` getter now reads `void this.cacheTick;`
before returning `sweepCache.size`. The Map is annotated `false` in
`makeAutoObservable` (intentionally — deep-tracking ~1.7 M tuple
entries would be a disaster), so the existing `cacheTick` counter is
the only signal MobX can react to. Without this dep, the live
"Records" stat froze at 0 — caught during browser smoke-testing,
fixed, re-verified.

### Æther style overlay

- `App.tsx` mirrors `secret.aetherActive` onto `<html data-aether="1">`
  via `useEffect` (cleared on revert and on unmount).
- `web/src/styles/globals.css` gained a `[data-aether="1"]` block:
  - Shifts `--accent-*` to cosmic violet (`#5e3aa6` / `#8c6bd4`).
    Paper / ink / oxblood untouched, so every theme keeps identity.
  - Faint indigo radial vignette + 96 px hairline grid on `body`
    (starfield + graph paper).
  - Soft violet halo + "Æ" watermark in the top-right of
    `.page-surface`.
  - Violet text-shadow on the active `SecretBadge` (`✦`).

Purely additive — leaving Æther mode removes the attribute and every
selector falls away cleanly.

## Verification

- `npm --workspace web run typecheck` — clean.
- `npm --workspace web run test` — 43/43 passing.
- `npm --workspace web run build` — production bundle compiles clean.
- Browser smoke: Konami unlocked, sidebar shows
  `1,711,314 / live / 1-5000 / 2026-04-18`. Drove an arity-4 sweep on
  `[2,3,5,7]`, then an arity-5 sweep on `[2,3,5,7,11]`, watched
  Records tick 1 → 2 in real time. Violet accents visible on
  tabs / labels / target value / chosen bar in the adjacent strip /
  the "Five thousand" italic in the H1 / footer `✦`. Page-surface
  halo and Æ watermark present.

## Notes / technical debt

- The Æther universe count (1,711,314) is the *theoretical* upper
  bound for arities 3–5 across the full `ADV_DICE_RANGE`. The actual
  on-demand sweep universe is far larger if you allow operator
  permutations, but for the "how many tuples are addressable" framing
  the multiset count is the right answer.
- "Records" in Æther mode is a live count of *completed sweeps*, not
  an estimate of total writeable cells. This makes the number honest
  (it really is what the user has computed so far) at the cost of
  starting at 0 each session. Considered showing
  `cacheSize × ADV_TARGET_RANGE.length` for a "cells computed" framing
  but it would obscure the cache-vs-fresh distinction.
- Sweep cancellation still not implemented (carried forward from the
  Phase 2 task). A revoked sweep still runs to completion and lands
  in the cache — which now shows up as a Records bump even though the
  user navigated away. Acceptable for now.
