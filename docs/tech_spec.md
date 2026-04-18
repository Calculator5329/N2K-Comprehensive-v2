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
which itself observes `AppStore.secret.unlocked` and conditionally
appends the hidden "Æther" entry to the nav list.

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
- Web app shows the "Æther" nav entry (folio = "Æ"), the lazy-loaded
  `AetherView`, and a ✦ glyph in the Sidebar layout footer.

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

// web aether worker reply
export interface AetherWorkerSolution {
  readonly equation: string;     // human-readable, parens for negative bases
  readonly arity: number;        // 3 | 4 | 5
  readonly difficulty: number;   // advDifficultyOfEquation
  readonly elapsedMs: number;    // perf measurement for the UI
}
```
