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
| Worker (web)         | `solverWorker.ts`      | `aetherSolverWorker.ts` (pool)        |
| UI surface           | Lookup view            | Æther view (lazy-loaded)              |
| Visibility           | always                 | gated behind Konami unlock            |

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
     ▼ unlocked = true                    ▼
useNavItems()  →  appends "Æ" entry        prompt swaps to "Æ Enter…"
AetherView      →  lazy-loads & renders    Command #10 becomes findable
SecretBadge     →  ✦ in footer             Command #9 prompts for advanced
```

## Data flow — Æther on-demand solve

```
User clicks "Solve" in AetherView
     │
     ▼
AetherStore.solve()       — assigns monotonic token, sets state="solving"
     │
     ▼
solveAdvanced(dice, total)  — picks least-busy worker slot, postMessage
     │
     ▼
aetherSolverWorker         — easiestAdvanced + advDifficultyOfEquation
     │
     ▼
service routes reply by id  — pool slot's inFlight count -= 1
     │
     ▼
AetherStore                 — discards if token mismatched (stale reply),
                              else state="ready" with formatted equation
     │
     ▼
AetherView observes state   — renders SolutionDisplay
```
