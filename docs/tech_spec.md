# N2K Comprehensive Solver — Technical Specification

## Architecture

Three-layer separation, one-way deps:

```
UI (web/src/features, web/src/ui)
        │
        ▼
Stores (web/src/stores; src/cli for the REPL)
        │
        ▼
Services (web/src/services, src/services) — pure, stateless
        │
        ▼
Core (src/core) — types, constants, binary format
```

Web layouts depend on `useNavItems()` (hook in `web/src/ui/nav.ts`),
which returns the same five-tab nav regardless of mode. Æther mode
swaps the *contents* of each tab, not the tab list — see
`SecretStore.aetherActive` and the `Aether*View` siblings of each
primary view.

## Standard mode constants

| Constant         | Value      | Source                  |
| ---------------- | ---------- | ----------------------- |
| Dice range       | 2..20      | implicit                |
| Target range     | 1..999     | implicit                |
| Max exponents    | per-die    | `MAX_EXPONENTS` in `src/core/constants.ts` |
| Difficulty       | additive   | `DIFFICULTY` weights    |

## Æther (advanced) mode constants

| Constant              | Value         | Source                           |
| --------------------- | ------------- | -------------------------------- |
| `ADV_DICE_RANGE`      | -10..32       | `src/core/constants.ts`          |
| `ADV_TARGET_RANGE`    | 1..5,000      | `src/core/constants.ts`          |
| `ADV_MAGNITUDE_CEIL`  | 1,000,000     | base power cap                   |
| `ADV_BASE_TWO_CAP`    | 2^20          | exception for base-2             |
| `ADV_SAFE_MAGNITUDE`  | derived       | runtime intermediate-value cap   |
| `Arity`               | 3 \| 4 \| 5  | `src/core/types.ts`              |
| `NEquation`           | N-arity eqn   | `src/core/types.ts`              |

## Æther solver pipeline

1. `enumerateUnorderedTuples(arity, range)` — multisets of dice
2. For each tuple, `solveAdvancedForAllTargets({ dice, targetRange })`
   brute-forces every (operator-tuple × distinct-permutation × exponent)
   combination, pruning intermediates that exceed `ADV_SAFE_MAGNITUDE`.
3. `easiestAdvanced({ dice, total })` does auto-arity: tries 3-element
   subsets first, then 4, then 5; returns the lowest-difficulty
   `NEquation` across all subsets.
4. `advDifficultyOfEquation` scores each candidate (sign-aware,
   magnitude-aware, arity penalties).
5. Bulk exporter emits a per-tuple `.n2k` chunk + per-arity index +
   coverage file via worker pool.

## `.n2k` binary format

Three file kinds, magic `N2K\0`, version 1:

- **Chunk** — every `(target → easiest equation)` cell for one dice
  tuple, bit-packed:
  - target: 13 bits (1..5000)
  - difficulty * 100: 14 bits (0..16383)
  - per-die exponent: variable bits sized to that die's `advMaxExponentFor`
  - per-operator: 2 bits (4 ops)
- **Index** — per-arity manifest of all chunk files + summary stats
- **Coverage** — per-arity bitmap of solvable targets per tuple,
  for fast "does this tuple solve this target?" lookups

`BitReader` / `BitWriter` in `src/core/n2kBinary.ts` handle the I/O.

## Konami unlock

| Surface | Trigger          | Implementation                                    |
| ------- | ---------------- | ------------------------------------------------- |
| CLI     | `UDUDLRLR`       | `src/cli/secretState.ts`, ingested in REPL loop   |
| Web     | ↑↑↓↓←→←→ba       | `web/src/stores/SecretStore.ts`, global keydown   |

Once unlocked:

- CLI prompt becomes `Æ Enter a command: ` and Command #10 (advanced
  solve) becomes available; Command #9 prompts for advanced exporter.
- Web app activates `secret.aetherActive`, which causes every primary
  view to swap to its `Aether*View` sibling:
  | Tab       | Standard view             | Æther view             |
  | --------- | ------------------------- | ---------------------- |
  | Lookup    | `LookupView` (3 dice, 1..999)   | `AetherLookupView` (3-5 dice, 1..5,000) |
  | Explore   | `ExploreView` (full 1,540-tuple table) | `AetherExploreView` (sample of ~3,300 tuples, paginated, search) |
  | Compare   | `CompareView` (up to 4 triples) | `AetherCompareView` (up to 4 mixed-arity tuples) |
  | Visualize | `VisualizeView` (heatmap + scatter + histograms) | `AetherVisualizeView` (per-tuple band + opt-in sampled atlas) |
  | Compose   | `ComposeView` (standard pools)  | `ComposeView` + Æther-sample pool + Æther note |
- Nav badge `✧` (unlocked, standard mode) becomes `✦` (active) and
  doubles as a click-to-toggle.

## Worker model

- **CLI bulk export**: Node `worker_threads` pool sized to
  `--workers=N` (default = CPU count). Bootstrap shim
  `scripts/advanced-worker-bootstrap.mjs` registers `tsx/esm/api` so
  workers can import TypeScript modules under Node 22.
- **Web on-demand solve**: Vite-built Web Worker
  (`aetherSolverWorker.ts?worker`) wrapped by a singleton service
  (`aetherSolverService.ts`) that maintains a pool of up to
  `navigator.hardwareConcurrency - 1` workers. Each request gets a
  monotonic id; replies are routed back via a `Map<id, handlers>`.
  Two request kinds:
  - `"solve"` — single target, auto-arity (3 → 4 → 5).
  - `"sweep"` — every target in `[minTotal, maxTotal]` for a fixed
    arity. Cheap because `solveAdvancedForAllTargets` amortizes
    enumeration across the entire target range. This is the primitive
    the all-tabs Æther integration is built on.

`AetherDataStore` (web/src/stores) sits on top of the service as a
lazy per-tuple sweep cache. Concurrent requests for the same tuple
are deduped via an in-flight `Map<key, Promise>`. Summaries are
derived on first read and memoized.

## API contracts (key shapes)

```ts
// src/core/types.ts
export type Arity = 3 | 4 | 5;
export interface NEquation {
  readonly dice: readonly number[];
  readonly exps: readonly number[];
  readonly ops:  readonly Operator[];
  readonly total: number;
}

// web aether worker reply (single-target solve)
export interface AetherWorkerSolution {
  readonly equation: string;     // human-readable, parens for negative bases
  readonly arity: number;        // 3 | 4 | 5
  readonly difficulty: number;   // advDifficultyOfEquation
  readonly elapsedMs: number;    // perf measurement for the UI
}

// web aether worker reply (whole-tuple sweep)
export type AetherSweepRow = readonly [
  target: number,
  equation: string,
  difficulty: number,
];
export interface AetherSweepResult {
  readonly arity: number;
  readonly elapsedMs: number;
  readonly rows: readonly AetherSweepRow[];
}

// AetherDataStore-side view of a sweep (after inflate)
export interface AetherTupleSweep {
  readonly tuple: AetherTuple;
  readonly arity: AetherArity;
  readonly elapsedMs: number;
  readonly cells: ReadonlyMap<number, AetherCell>;
  readonly targetsSorted: readonly number[];
}

// Lazy per-tuple summary, derived from AetherTupleSweep
export interface AetherTupleSummary {
  readonly tuple: AetherTuple;
  readonly arity: AetherArity;
  readonly solvableCount: number;
  readonly impossibleCount: number;
  readonly minDifficulty: number | null;
  readonly maxDifficulty: number | null;
  readonly averageDifficulty: number | null;
  readonly medianDifficulty: number | null;
}
```
