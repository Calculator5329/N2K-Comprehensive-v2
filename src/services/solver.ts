import {
  ALL_OPERATORS,
  FLOAT_EQ_EPSILON,
  MAX_EXPONENTS,
} from "../core/constants.js";
import type { Equation, SolverInput } from "../core/types.js";
import { evaluateLeftToRight, permutationsOf3 } from "./arithmetic.js";
import { difficultyOfEquation } from "./difficulty.js";

/**
 * Reduce a "compound" dice value (4, 8, 9, 16) down to its prime base so the
 * solver can reuse cached exponent caps. For example, an 8 die is treated as
 * a 2 die with one extra exponent slot of headroom.
 */
function depower(dice: number): number {
  switch (dice) {
    case 4:
    case 8:
    case 16:
      return 2;
    case 9:
      return 3;
    default:
      return dice;
  }
}

/**
 * Number of valid exponents for a given dice value (i.e. legal `p` values
 * are `0 .. exponentCountFor(d) - 1`). Falls back to a single exponent slot
 * for dice values outside the lookup table so we never throw on bad input.
 */
function exponentCountFor(dice: number): number {
  return MAX_EXPONENTS[dice] ?? 1;
}

/** Precompute `[d^0, d^1, ..., d^(cap-1)]` for fast inner-loop lookup. */
function precomputeBases(dice: number): number[] {
  const cap = exponentCountFor(dice);
  const bases: number[] = new Array(cap);
  for (let p = 0; p < cap; p += 1) bases[p] = Math.pow(dice, p);
  return bases;
}

/**
 * Build a tiny lookup keyed by base value that returns the precomputed
 * `bases` array. With three dice we get at most three unique base values,
 * but `permutationsOf3` walks them up to six times — sharing a single
 * computation per unique base saves the redundant allocations and
 * `Math.pow` calls inside the hot loop.
 */
function buildBasesCache(
  d1: number,
  d2: number,
  d3: number,
): Map<number, number[]> {
  const cache = new Map<number, number[]>();
  if (!cache.has(d1)) cache.set(d1, precomputeBases(d1));
  if (!cache.has(d2)) cache.set(d2, precomputeBases(d2));
  if (!cache.has(d3)) cache.set(d3, precomputeBases(d3));
  return cache;
}

export interface SolverOptions {
  /**
   * If true (default), compound dice (4, 8, 9, 16) are reduced to their
   * prime base before solving — matches the original Python game behavior
   * where players treat e.g. an 8 die as 2^3. Set false to use the raw dice
   * value as the base.
   */
  readonly depower?: boolean;
}

/**
 * Find the easiest (lowest-difficulty) equation, if any, that uses each of
 * the three dice exactly once and evaluates to `total`.
 *
 * Returns `null` when no valid equation exists.
 */
export function easiestSolution(
  input: SolverInput,
  options: SolverOptions = {},
): Equation | null {
  const useDepower = options.depower ?? true;
  const [rawD1, rawD2, rawD3] = input.dice;
  const d1Base = useDepower ? depower(rawD1) : rawD1;
  const d2Base = useDepower ? depower(rawD2) : rawD2;
  const d3Base = useDepower ? depower(rawD3) : rawD3;
  const { total } = input;

  let best: Equation | null = null;
  let bestDifficulty = Number.POSITIVE_INFINITY;

  const basesCache = buildBasesCache(d1Base, d2Base, d3Base);

  for (const [d1, d2, d3] of permutationsOf3(d1Base, d2Base, d3Base)) {
    const bases1 = basesCache.get(d1)!;
    const bases2 = basesCache.get(d2)!;
    const bases3 = basesCache.get(d3)!;

    for (let p1 = 0; p1 < bases1.length; p1 += 1) {
      const base1 = bases1[p1]!;
      for (let p2 = 0; p2 < bases2.length; p2 += 1) {
        const base2 = bases2[p2]!;
        for (let p3 = 0; p3 < bases3.length; p3 += 1) {
          const base3 = bases3[p3]!;
          for (const o1 of ALL_OPERATORS) {
            for (const o2 of ALL_OPERATORS) {
              const result = evaluateLeftToRight(base1, base2, base3, o1, o2);
              if (!Number.isFinite(result)) continue;
              if (Math.abs(result - total) > FLOAT_EQ_EPSILON) continue;

              const candidate: Equation = {
                d1, d2, d3, p1, p2, p3, o1, o2, total,
              };
              const score = difficultyOfEquation(candidate);
              if (score < bestDifficulty) {
                bestDifficulty = score;
                best = candidate;
              }
            }
          }
        }
      }
    }
  }

  return best;
}

/** Result row for a single (dice, total) cell in a bulk export. */
export interface BulkSolution {
  readonly equation: Equation;
  readonly difficulty: number;
}

/**
 * Find every valid equation that uses each of the three dice exactly once
 * and evaluates to `total`, sorted by difficulty ascending (easiest first).
 *
 * Unlike `easiestSolution` this surfaces the full set of ways to land the
 * target — useful for the "all equations" Lookup mode in the web UI. The
 * enumeration is identical; we just collect every match instead of keeping
 * only the cheapest.
 *
 * Note: each unique `(d1, d2, d3, p1, p2, p3, o1, o2)` tuple is its own
 * row, so commutative reorderings of the dice (e.g. `2 + 3 + 5` vs
 * `5 + 3 + 2`) appear as distinct entries. This is intentional — players
 * see and read these as different expressions, even when they're
 * mathematically equivalent.
 */
export function allSolutions(
  input: SolverInput,
  options: SolverOptions = {},
): BulkSolution[] {
  const useDepower = options.depower ?? true;
  const [rawD1, rawD2, rawD3] = input.dice;
  const d1Base = useDepower ? depower(rawD1) : rawD1;
  const d2Base = useDepower ? depower(rawD2) : rawD2;
  const d3Base = useDepower ? depower(rawD3) : rawD3;
  const { total } = input;

  const results: BulkSolution[] = [];
  const basesCache = buildBasesCache(d1Base, d2Base, d3Base);

  for (const [d1, d2, d3] of permutationsOf3(d1Base, d2Base, d3Base)) {
    const bases1 = basesCache.get(d1)!;
    const bases2 = basesCache.get(d2)!;
    const bases3 = basesCache.get(d3)!;

    for (let p1 = 0; p1 < bases1.length; p1 += 1) {
      const base1 = bases1[p1]!;
      for (let p2 = 0; p2 < bases2.length; p2 += 1) {
        const base2 = bases2[p2]!;
        for (let p3 = 0; p3 < bases3.length; p3 += 1) {
          const base3 = bases3[p3]!;
          for (const o1 of ALL_OPERATORS) {
            for (const o2 of ALL_OPERATORS) {
              const result = evaluateLeftToRight(base1, base2, base3, o1, o2);
              if (!Number.isFinite(result)) continue;
              if (Math.abs(result - total) > FLOAT_EQ_EPSILON) continue;

              const candidate: Equation = {
                d1, d2, d3, p1, p2, p3, o1, o2, total,
              };
              results.push({
                equation: candidate,
                difficulty: difficultyOfEquation(candidate),
              });
            }
          }
        }
      }
    }
  }

  results.sort((a, b) => a.difficulty - b.difficulty);
  return results;
}

/**
 * Solve every integer target in `[minTotal, maxTotal]` for a single dice
 * triple in a SINGLE enumeration of the equation space.
 *
 * Returns a `Map<total, BulkSolution>` keyed by the integer target, holding
 * the lowest-difficulty equation that hits it. Targets with no solution are
 * simply absent from the map.
 *
 * This is dramatically faster than calling `easiestSolution` once per target
 * (~999x for a [1, 999] range) because the candidate enumeration is the
 * dominant cost.
 */
export function solveForAllTargets(
  dice: SolverInput["dice"],
  minTotal: number,
  maxTotal: number,
  options: SolverOptions = {},
): Map<number, BulkSolution> {
  const useDepower = options.depower ?? true;
  const [rawD1, rawD2, rawD3] = dice;
  const d1Base = useDepower ? depower(rawD1) : rawD1;
  const d2Base = useDepower ? depower(rawD2) : rawD2;
  const d3Base = useDepower ? depower(rawD3) : rawD3;

  const best = new Map<number, BulkSolution>();

  const basesCache = buildBasesCache(d1Base, d2Base, d3Base);

  for (const [d1, d2, d3] of permutationsOf3(d1Base, d2Base, d3Base)) {
    const bases1 = basesCache.get(d1)!;
    const bases2 = basesCache.get(d2)!;
    const bases3 = basesCache.get(d3)!;

    for (let p1 = 0; p1 < bases1.length; p1 += 1) {
      const base1 = bases1[p1]!;
      for (let p2 = 0; p2 < bases2.length; p2 += 1) {
        const base2 = bases2[p2]!;
        for (let p3 = 0; p3 < bases3.length; p3 += 1) {
          const base3 = bases3[p3]!;
          for (const o1 of ALL_OPERATORS) {
            for (const o2 of ALL_OPERATORS) {
              const result = evaluateLeftToRight(base1, base2, base3, o1, o2);
              if (!Number.isFinite(result)) continue;

              // Snap to nearest integer if within tolerance; otherwise skip.
              const rounded = Math.round(result);
              if (Math.abs(result - rounded) > FLOAT_EQ_EPSILON) continue;
              if (rounded < minTotal || rounded > maxTotal) continue;

              const candidate: Equation = {
                d1, d2, d3, p1, p2, p3, o1, o2, total: rounded,
              };
              const difficulty = difficultyOfEquation(candidate);
              const current = best.get(rounded);
              if (current === undefined || difficulty < current.difficulty) {
                best.set(rounded, { equation: candidate, difficulty });
              }
            }
          }
        }
      }
    }
  }

  return best;
}
