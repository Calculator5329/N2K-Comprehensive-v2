# N2K Comprehensive Solver — Architecture

## Layered model

```
┌──────────────────────────────────────────────────────────────┐
│                            UI                                │
│  CLI REPL (src/cli)              Web app (web/src/features)  │
└─────────────────────────────┬───────────────────────────────-┘
                              │
┌─────────────────────────────▼───────────────────────────────-┐
│                          STORES                              │
│  src/cli (REPL state, SecretState)                           │
│  web/src/stores (AppStore, DataStore, SecretStore, …)        │
└─────────────────────────────┬────────────────────────────────┘
                              │
┌─────────────────────────────▼─────────────────────────────--─┐
│                         SERVICES                             │
│  src/services (solver, advancedSolver, advancedExporter, …)  │
│  web/src/services (datasetService, solverWorker,             │
│                    aetherSolverWorker, …)                    │
└─────────────────────────────┬───────────────────────────────-┘
                              │
┌─────────────────────────────▼─────────────────────────────--─┐
│                           CORE                               │
│  src/core (types, constants, n2kBinary)                      │
└──────────────────────────────────────────────────────────────┘
```

Rules:

- UI components observe stores; never call services directly except via
  worker façades.
- Stores never import UI; they orchestrate services.
- Services are stateless and reusable; no MobX, no DOM.
- Core has no runtime dependencies — types, constants, pure file format.
- The web workspace can import any `src/*` module via the `@solver`
  alias declared in `web/vite.config.ts`.
- Features never import from each other; cross-feature communication
  goes through stores.

## Web dataset artifacts

Generated under `web/public/data/`, served as static JSON:

| file                  | shape                                                      | consumers                                                       |
| --------------------- | ---------------------------------------------------------- | --------------------------------------------------------------- |
| `index.json`          | `{ meta, dice: DiceSummary[] }`                            | App boot — totals strip, dice summaries everywhere              |
| `by-target.json`      | `{ [t]: { dice, difficulty, equation } \| null }`          | Lookup "what hits X?", Visualize coverage                       |
| `target-stats.json`   | `{ [t]: { easiest, hardest, solverCount } }`               | Visualize "Hardest reachable" + "Coverage gaps" overlays        |
| `difficulty.json`     | `{ totalMin, totalMax, dice: { "a-b-c": (number\|null)[] } }` | Compose — single-fetch resolver for the whole candidate pool    |
| `dice/{a-b-c}.json`   | `{ dice, summary, solutions: { [t]: { difficulty, equation } } }` | Lookup, Explore, Compare, Visualize, Gallery (one chunk at a time) |

`difficulty.json` is the equation-stripped flat view of the per-dice
chunks. Compose's expected-score heuristic only needs `(dice, target)
-> difficulty` for a whole candidate pool at once, which used to cost
~1,500 lazy chunk requests for the Extensive pool. The bundled matrix
collapses that into a single ~880 KB gzip fetch (and ~540 KB brotli).
The per-dice chunks stay authoritative for any view that also renders
equation strings.

## Mode separation

The codebase carries two parallel solver pipelines:

| Concern              | Standard mode          | Æther mode                            |
| -------------------- | ---------------------- | ------------------------------------- |
| Equation type        | `Equation` (3-arity)   | `NEquation` (3..5 arity)              |
| Solver entry         | `allSolutions`         | `easiestAdvanced` / `solveAdvancedForAllTargets` |
| Difficulty           | `difficultyOfEquation` | `advDifficultyOfEquation`             |
| Exporter             | `exportAllSolutions`   | `exportTupleAdvanced` + `ArityAggregator` |
| File format          | JSON dataset           | `.n2k` binary chunks/index/coverage   |
| Worker (CLI)         | inline (single thread) | `worker_threads` pool                 |
| Worker (web)         | `solverWorker.ts`      | `aetherSolverWorker.ts` (pool, `solve` + `sweep` kinds) |
| UI surface           | All five tabs          | All five tabs (Æther-aware variants)  |
| Visibility           | always                 | gated behind Konami unlock            |
| Mode flip            | n/a                    | `SecretStore.mode` (toggleable from `SecretBadge`) |

The two pipelines share parsing helpers, the operator vocabulary, and
the magnitude-pruning approach, but otherwise stand independently to
keep the standard-mode code path predictable and untouched by the more
expensive advanced search.

## Konami unlock plumbing

```
keydown event
     │
     ▼
SecretStore.ingestKey()  (web)   /   SecretState.ingest()  (CLI)
     │                                    │
     ▼ unlocked = true, mode = "aether"   ▼
SecretBadge     →  ✦ button in nav         prompt swaps to "Æ Enter…"
LookupView      →  swaps to AetherLookup  Command #10 becomes findable
ExploreView     →  swaps to AetherExplore Command #9 prompts for advanced
CompareView     →  swaps to AetherCompare
VisualizeView   →  swaps to AetherVisualize
ComposeView     →  shows Æther note + adds "aetherSample" pool option
```

The badge doubles as a toggle: clicking it flips `secret.mode` between
`"standard"` and `"aether"`. The unlock state itself sticks for the
session — only the rendered surface changes.

When `secret.aetherActive` is true, two more things happen at the shell
level (not per-tab):

1. **`<html data-aether="1">`** — `App.tsx` mirrors the flag onto the
   document element via `useEffect`. `globals.css` keys an overlay off
   that selector to shift accents toward cosmic violet, add a faint
   indigo vignette + hairline grid to the body, and place a small "Æ"
   watermark on `.page-surface`. The overlay is purely additive — it
   layers on top of whichever theme is active and falls away cleanly
   when the attribute is removed.
2. **`useAlmanacIndex()`** — the dataset stats strip every layout
   renders (Triples / Records / Targets / Compiled) routes through this
   hook instead of reading `data.index` directly. In standard mode it
   returns the precomputed index; in Æther mode it returns a synthetic
   `DatasetIndex` with `diceTriplesTotal = 1,711,314` (combinatorial
   tuple count over arities 3, 4, 5 across the full `ADV_DICE_RANGE`),
   `recordsWritten = AetherDataStore.cacheSize` (live), and
   `total{Min,Max} = ADV_TARGET_RANGE`. All twelve layouts swapped to
   the hook with zero label changes.

## Data flow — Æther on-demand solve

Two worker entry points serve the Æther-aware tabs:

```
solveAdvanced(dice, total)        — single-target auto-arity solve
sweepAdvanced(dice, [min..max])   — full target sweep, fixed arity
```

Both flow through `aetherSolverService` (worker pool, least-busy
assignment, reply-by-id routing) and are typed via `AetherWorkerResponse`.

The sweep primitive is the one that makes the all-tabs integration
viable: solving a 5,000-target range for one fixed-arity tuple is
roughly the cost of a single `solveAdvanced` call (operator/exponent
enumeration is amortized). Without it, the Lookup / Explore / Compare /
Visualize tabs would individually post 5,000 worker messages per tuple.

```
User opens AetherLookup with tuple T
     │
     ▼
AetherDataStore.ensureSweep(T)  — dedupes against in-flight + cached
     │
     ▼
sweepAdvanced(T, 1, 5000)       — picks least-busy worker
     │
     ▼
aetherSolverWorker.handleSweep  — solveAdvancedForAllTargets(T, 1, 5000)
     │
     ▼
{ rows: [target, equation, difficulty][], elapsedMs }
     │
     ▼
AetherDataStore.sweepCache[T] = { status: "ready", value: ... }
     │
     ▼
Every observer of T (Lookup solution panel, Explore row, Compare series,
Visualize band) re-renders against the freshly-cached sweep.
```

Summary statistics (`AetherTupleSummary`) are derived lazily on first
access via `AetherDataStore.summaryFor(T)` and memoized in a parallel
`summaryCache` so sort-by-stats in Explore stays cheap.
