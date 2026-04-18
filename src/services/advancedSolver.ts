import {
  ADV_SAFE_MAGNITUDE,
  ALL_OPERATORS,
  FLOAT_EQ_EPSILON,
  advMaxExponentFor,
} from "../core/constants.js";
import type { Arity, NEquation, Operator } from "../core/types.js";
import { applyOperator, distinctPermutations } from "./arithmetic.js";
import {
  advDifficultyOfEquation,
  buildAllBasesCache,
  type AllBasesCache,
} from "./advancedDifficulty.js";

/** Per-cell solver result mirroring the standard `BulkSolution`. */
export interface AdvBulkSolution {
  readonly equation: NEquation;
  readonly difficulty: number;
}

export interface AdvancedSolverOptions {
  /**
   * Bail out when any left-to-right partial result exceeds this absolute
   * value. Keeps integer precision and prunes pathological branches.
   * Defaults to {@link ADV_SAFE_MAGNITUDE}.
   */
  readonly safeMagnitude?: number;
}

/**
 * Per-permutation progress notification. Fired once after each
 * permutation finishes enumerating. `best` is the running best-so-far
 * map (target → cheapest equation found yet); it MUST NOT be retained
 * past the callback because the solver continues to mutate it.
 *
 * Wire this from the worker to stream a partial result to the UI so
 * arity-5 sweeps (which take 1–3 minutes) can render an answer within
 * the first few hundred milliseconds and tighten as the sweep
 * progresses.
 */
export interface AdvancedSweepProgress {
  readonly permsDone: number;
  readonly permsTotal: number;
  readonly best: ReadonlyMap<number, AdvBulkSolution>;
}

export interface AdvancedSolverInput {
  readonly dice: readonly number[];
  readonly total: number;
  readonly options?: AdvancedSolverOptions;
}

// ---------------------------------------------------------------------------
//  Internal helpers
// ---------------------------------------------------------------------------

/** Precompute `[d^0, d^1, ..., d^cap]` for fast inner-loop lookup. */
function precomputeBasesAdv(dice: number): number[] {
  const cap = advMaxExponentFor(dice);
  const bases: number[] = new Array(cap + 1);
  for (let p = 0; p <= cap; p += 1) bases[p] = Math.pow(dice, p);
  return bases;
}

/** Cache `precomputeBasesAdv(d)` keyed by the dice value itself. */
function buildBasesCache(dice: readonly number[]): Map<number, number[]> {
  const cache = new Map<number, number[]>();
  for (const d of dice) {
    if (!cache.has(d)) cache.set(d, precomputeBasesAdv(d));
  }
  return cache;
}

/** Enumerate every operator tuple of length `n` (4^n total). */
function allOpTuples(n: number): Operator[][] {
  const out: Operator[][] = [];
  const cur: Operator[] = new Array(n);
  function recurse(i: number): void {
    if (i === n) {
      out.push(cur.slice());
      return;
    }
    for (const op of ALL_OPERATORS) {
      cur[i] = op;
      recurse(i + 1);
    }
  }
  recurse(0);
  return out;
}

/**
 * Inner enumeration: for one permutation of dice values, walk every
 * exponent tuple × every operator tuple, pruning intermediates that
 * exceed `safeMagnitude`. Updates `best` in place when a candidate hits
 * an integer target inside `[minTotal, maxTotal]` with lower difficulty
 * than what's already there.
 */
function enumerateForPermutation(
  perm: readonly number[],
  basesCache: Map<number, number[]>,
  opTuples: readonly Operator[][],
  minTotal: number,
  maxTotal: number,
  safeMagnitude: number,
  allBases: AllBasesCache,
  best: Map<number, AdvBulkSolution>,
): void {
  const N = perm.length;
  const baseArrays: number[][] = new Array(N);
  for (let i = 0; i < N; i += 1) baseArrays[i] = basesCache.get(perm[i]!)!;

  const exps: number[] = new Array(N).fill(0);
  const values: number[] = new Array(N);

  function tryAllOps(): void {
    for (const opTuple of opTuples) {
      // Inline left-to-right evaluation with overflow short-circuit.
      let acc = values[0]!;
      if (Math.abs(acc) > safeMagnitude) continue;
      let overflow = false;
      for (let i = 0; i < opTuple.length; i += 1) {
        acc = applyOperator(acc, values[i + 1]!, opTuple[i]!);
        if (!Number.isFinite(acc) || Math.abs(acc) > safeMagnitude) {
          overflow = true;
          break;
        }
      }
      if (overflow) continue;
      const rounded = Math.round(acc);
      if (Math.abs(acc - rounded) > FLOAT_EQ_EPSILON) continue;
      if (rounded < minTotal || rounded > maxTotal) continue;

      const candidate: NEquation = {
        dice: perm.slice(),
        exps: exps.slice(),
        ops: opTuple.slice(),
        total: rounded,
      };
      const diff = advDifficultyOfEquation(candidate, allBases);
      const cur = best.get(rounded);
      if (cur === undefined || diff < cur.difficulty) {
        best.set(rounded, { equation: candidate, difficulty: diff });
      }
    }
  }

  function pickExp(level: number): void {
    if (level === N) {
      tryAllOps();
      return;
    }
    const arr = baseArrays[level]!;
    for (let p = 0; p < arr.length; p += 1) {
      values[level] = arr[p]!;
      exps[level] = p;
      pickExp(level + 1);
    }
  }

  pickExp(0);
}

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------

/**
 * Solve every integer target in `[minTotal, maxTotal]` for one dice
 * tuple in a single enumeration of the equation space. Mirrors the
 * standard mode's `solveForAllTargets`, generalized for arity 3..5 and
 * negative dice values.
 */
export function solveAdvancedForAllTargets(
  dice: readonly number[],
  minTotal: number,
  maxTotal: number,
  options: AdvancedSolverOptions = {},
  onPermComplete?: (progress: AdvancedSweepProgress) => void,
): Map<number, AdvBulkSolution> {
  if (dice.length < 3 || dice.length > 5) {
    throw new RangeError(
      `solveAdvancedForAllTargets: dice arity must be 3..5 (got ${dice.length})`,
    );
  }

  const safeMagnitude = options.safeMagnitude ?? ADV_SAFE_MAGNITUDE;
  const basesCache = buildBasesCache(dice);
  const allBases = buildAllBasesCache(dice);
  const opTuples = allOpTuples(dice.length - 1);
  const best = new Map<number, AdvBulkSolution>();

  // Materialize the permutation list up front so we can report
  // (permsDone / permsTotal) progress. The list maxes out at 5! = 120
  // entries even with all-distinct arity-5 input, so the extra
  // allocation is negligible compared to the per-perm enumeration cost.
  const perms = onPermComplete === undefined
    ? null
    : [...distinctPermutations(dice)];
  const iter = perms ?? distinctPermutations(dice);
  const permsTotal = perms?.length ?? 0;
  let permsDone = 0;

  for (const perm of iter) {
    enumerateForPermutation(
      perm,
      basesCache,
      opTuples,
      minTotal,
      maxTotal,
      safeMagnitude,
      allBases,
      best,
    );
    if (onPermComplete !== undefined) {
      permsDone += 1;
      onPermComplete({ permsDone, permsTotal, best });
    }
  }

  return best;
}

/**
 * Find the easiest equation (lowest difficulty) that uses a subset of
 * `dice` and evaluates to `total`.
 *
 * "Auto-arity": when `dice.length > 3`, the solver tries every 3-subset
 * first and returns the easiest hit there if any exist. If no 3-subset
 * works, it tries every 4-subset, and finally the full N-subset. This
 * matches the locked decision in `docs/current_task.md` — smallest
 * arity that hits the target wins, with difficulty as the tie-breaker
 * within an arity.
 *
 * Returns `null` when no subset can hit the target.
 */
export function easiestAdvanced(
  input: AdvancedSolverInput,
): NEquation | null {
  const { dice, total, options } = input;
  if (dice.length < 3 || dice.length > 5) {
    throw new RangeError(
      `easiestAdvanced: dice pool size must be 3..5 (got ${dice.length})`,
    );
  }

  for (let subsetSize = 3; subsetSize <= dice.length; subsetSize += 1) {
    let bestEq: NEquation | null = null;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const subset of unorderedSubsets(dice, subsetSize)) {
      const cellMap = solveAdvancedForAllTargets(subset, total, total, options);
      const hit = cellMap.get(total);
      if (hit && hit.difficulty < bestDiff) {
        bestDiff = hit.difficulty;
        bestEq = hit.equation;
      }
    }
    if (bestEq !== null) return bestEq;
  }
  return null;
}

/**
 * Yield every unordered `k`-element subset of `items` (by index, so
 * duplicate values stay distinguishable). Subsets are returned as
 * arrays of values in their original positional order.
 */
function* unorderedSubsets<T>(
  items: readonly T[],
  k: number,
): Generator<readonly T[]> {
  const n = items.length;
  if (k > n || k < 0) return;
  const idx: number[] = new Array(k);
  function* recurse(start: number, depth: number): Generator<readonly T[]> {
    if (depth === k) {
      yield idx.map((i) => items[i]!);
      return;
    }
    for (let i = start; i <= n - (k - depth); i += 1) {
      idx[depth] = i;
      yield* recurse(i + 1, depth + 1);
    }
  }
  yield* recurse(0, 0);
}

// ---------------------------------------------------------------------------
//  Bulk-export entry point — solves one tuple at the given arity.
// ---------------------------------------------------------------------------

/**
 * Bulk-export entry point: solve every target in `[minTotal, maxTotal]`
 * for one dice tuple at a fixed arity. Returns the solutions in target
 * order so the export can stream them without sorting.
 */
export function solveOneTuple(
  dice: readonly number[],
  arity: Arity,
  minTotal: number,
  maxTotal: number,
  options: AdvancedSolverOptions = {},
): AdvBulkSolution[] {
  if (dice.length !== arity) {
    throw new RangeError(
      `solveOneTuple: dice.length (${dice.length}) must equal arity (${arity})`,
    );
  }
  const map = solveAdvancedForAllTargets(dice, minTotal, maxTotal, options);
  const sortedTotals = [...map.keys()].sort((a, b) => a - b);
  return sortedTotals.map((t) => map.get(t)!);
}

// ---------------------------------------------------------------------------
//  Tuple enumeration for the export driver
// ---------------------------------------------------------------------------

/**
 * Enumerate every unordered N-tuple `(a₁, a₂, ..., a_N)` with
 * `min ≤ a₁ ≤ a₂ ≤ ... ≤ a_N ≤ max`. Generalization of the standard
 * `enumerateUnorderedTriples`.
 */
export function enumerateUnorderedTuples(
  arity: Arity,
  min: number,
  max: number,
): number[][] {
  if (min > max) {
    throw new RangeError(`enumerateUnorderedTuples: min (${min}) > max (${max})`);
  }
  const out: number[][] = [];
  const cur: number[] = new Array(arity);
  function recurse(level: number, lo: number): void {
    if (level === arity) {
      out.push(cur.slice());
      return;
    }
    for (let v = lo; v <= max; v += 1) {
      cur[level] = v;
      recurse(level + 1, v);
    }
  }
  recurse(0, min);
  return out;
}
