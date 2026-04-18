import { DIFFICULTY, MAX_EXPONENTS, OP } from "../core/constants.js";
import type { Equation } from "../core/types.js";

function countOccurrences<T>(needle: T, haystack: readonly T[]): number {
  let count = 0;
  for (const item of haystack) {
    if (item === needle) count += 1;
  }
  return count;
}

/**
 * One additive term in the difficulty score, surfaced for explainability.
 *
 * `contribution` is the signed value added to the running total before the
 * `tenFlag` simplification and upper-tail compression are applied. Bonuses
 * (zero / one exponents) come through as negative contributions.
 */
export interface DifficultyTerm {
  /** Stable id, useful for keyed React renders and i18n. */
  readonly id:
    | "totalMagnitude"
    | "shortestDistance"
    | "zeroExponents"
    | "oneExponents"
    | "largestSubresult"
    | "largestSubresultDistance"
    | "smallestMultiplier";
  /** Short human-readable label. */
  readonly label: string;
  /**
   * Plain-language description of *what was measured* (e.g. "√40 = 6.32"
   * or "2 zero exponents").
   */
  readonly input: string;
  /** Signed contribution to the raw subtotal, in difficulty units. */
  readonly contribution: number;
}

/**
 * Optional post-processing step. Each one is independent — `tenFlag` only
 * fires when one of the multiplied bases is 10; `upperTail` only fires
 * when the smoothed score crosses `DIFFICULTY.upperTailThreshold`.
 */
export interface DifficultyAdjustment {
  readonly id: "tenFlag" | "upperTailCompression" | "ceilingClamp";
  readonly label: string;
  readonly note: string;
  /** Score before this step. */
  readonly before: number;
  /** Score after this step. */
  readonly after: number;
}

/**
 * Full structured decomposition of a single equation's difficulty score.
 *
 * Sum of `terms[*].contribution` equals `rawSubtotal`. Each adjustment in
 * `adjustments` rewrites the running score in order; the final entry's
 * `after` always equals `final`.
 */
export interface DifficultyBreakdown {
  readonly equation: Equation;
  readonly terms: readonly DifficultyTerm[];
  readonly rawSubtotal: number;
  readonly adjustments: readonly DifficultyAdjustment[];
  readonly final: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Given a dice value, return every "base power" reachable from it within the
 * configured exponent cap (e.g. for a 6, returns [6^0, 6^1, ..., 6^9]).
 *
 * Falls back to `[d^0]` (i.e. `[1]`) for dice values outside the lookup table
 * so the function never throws on unexpected input. The narrower fallback is
 * intentional: an unknown die contributes only the trivial base.
 */
function basesForDice(dice: number): number[] {
  const cap = MAX_EXPONENTS[dice] ?? 1;
  const bases: number[] = [];
  for (let exp = 0; exp < cap; exp += 1) {
    bases.push(Math.pow(dice, exp));
  }
  return bases;
}

/**
 * Compute a heuristic difficulty score (roughly 0..100) for a given N2K
 * equation. Larger results are harder; smaller results are trivial. The exact
 * formula and weights live in `DIFFICULTY` (see core/constants.ts).
 */
export function difficultyOfEquation(equation: Equation): number {
  return difficultyBreakdown(equation).final;
}

/**
 * Same calculation as `difficultyOfEquation`, but returns every intermediate
 * piece (per-term contributions, post-processing adjustments, final score) so
 * UIs can explain *why* a number is what it is. The two functions share this
 * implementation so the breakdown can never drift from the headline value.
 */
export function difficultyBreakdown(equation: Equation): DifficultyBreakdown {
  const { d1, d2, d3, p1, p2, p3, o1, o2, total } = equation;

  const base1 = Math.pow(d1, p1);
  const base2 = Math.pow(d2, p2);
  const base3 = Math.pow(d3, p3);

  // 1) Distance between the closest "free" base power and the target total.
  const allBases = [...basesForDice(d1), ...basesForDice(d2), ...basesForDice(d3)];
  const shortestDistance = allBases.reduce(
    (min, base) => Math.min(min, Math.abs(base - total)),
    Number.POSITIVE_INFINITY,
  );

  // 2) Exponent shape penalties. Many ^0 / ^1 exponents = trivial equation.
  const exponents = [p1, p2, p3];
  const zeroes = countOccurrences(0, exponents);
  const ones = countOccurrences(1, exponents);

  // 3) Largest single sub-result, accounting for multiplications which
  // collapse two bases into a single product.
  let largestNum: number;
  let smallestMultiplier = 0;
  let tenFlag = false;

  if (o1 === OP.MUL) {
    if (d1 === 10 || d2 === 10) tenFlag = true;
    smallestMultiplier = Math.min(base1, base2);
  }
  if (o2 === OP.MUL) {
    if (d2 === 10 || d3 === 10) tenFlag = true;
    smallestMultiplier = Math.min(base2, base3);
  }

  if (o1 !== OP.MUL && o2 !== OP.MUL) {
    largestNum = Math.max(base1, base2, base3);
  } else if (o1 === OP.MUL) {
    largestNum = Math.max(base3, base1 * base2);
  } else {
    largestNum = Math.max(base1, base3 * base2);
  }

  if (smallestMultiplier <= 1) smallestMultiplier = 0;

  const largestNumDistance = Math.abs(largestNum - total);

  // 4) Weighted sum, captured per-term so the UI can show its receipts.
  const totalMagnitude =
    Math.sqrt(total) * DIFFICULTY.totalSqrtWeight;
  const shortestDistanceTerm =
    shortestDistance * DIFFICULTY.shortestDistanceWeight;
  const zeroesTerm =
    -zeroes * DIFFICULTY.zeroExponentPenaltyPerCount;
  const onesTerm =
    -ones * DIFFICULTY.oneExponentPenaltyPerCount;
  const largestSqrtTerm =
    Math.sqrt(largestNum) * DIFFICULTY.largestNumSqrtWeight;
  const largestDistanceTerm =
    largestNumDistance * DIFFICULTY.largestNumDistanceWeight;
  const smallestMultiplierTerm =
    Math.pow(smallestMultiplier, DIFFICULTY.smallestMultiplierExponent) *
    DIFFICULTY.smallestMultiplierWeight;

  const terms: DifficultyTerm[] = [
    {
      id: "totalMagnitude",
      label: "Target magnitude",
      input: `√${total} = ${round2(Math.sqrt(total))}`,
      contribution: totalMagnitude,
    },
    {
      id: "shortestDistance",
      label: "Distance from a free base power",
      input: `nearest |base − ${total}| = ${shortestDistance}`,
      contribution: shortestDistanceTerm,
    },
    {
      id: "zeroExponents",
      label: "Zero-exponent bonus",
      input:
        zeroes === 0
          ? "no ^0 exponents"
          : `${zeroes} × ^0 ⇒ ${zeroes} free 1s`,
      contribution: zeroesTerm,
    },
    {
      id: "oneExponents",
      label: "One-exponent bonus",
      input:
        ones === 0
          ? "no ^1 exponents"
          : `${ones} × ^1 ⇒ ${ones} bare dice`,
      contribution: onesTerm,
    },
    {
      id: "largestSubresult",
      label: "Largest sub-result magnitude",
      input: `√${largestNum} = ${round2(Math.sqrt(largestNum))}`,
      contribution: largestSqrtTerm,
    },
    {
      id: "largestSubresultDistance",
      label: "Largest sub-result distance from target",
      input: `|${largestNum} − ${total}| = ${largestNumDistance}`,
      contribution: largestDistanceTerm,
    },
    {
      id: "smallestMultiplier",
      label: "Smallest multiplicand penalty",
      input:
        smallestMultiplier === 0
          ? "no multiplication (or ×1 / ×0)"
          : `× ${smallestMultiplier}`,
      contribution: smallestMultiplierTerm,
    },
  ];

  const rawSubtotal = terms.reduce((acc, t) => acc + t.contribution, 0);

  const adjustments: DifficultyAdjustment[] = [];
  let running = rawSubtotal;

  if (tenFlag) {
    const after = (running - DIFFICULTY.tenFlagOffset) / DIFFICULTY.tenFlagDivisor;
    adjustments.push({
      id: "tenFlag",
      label: "×10 simplification",
      note: `(score − ${DIFFICULTY.tenFlagOffset}) ÷ ${DIFFICULTY.tenFlagDivisor}`,
      before: running,
      after,
    });
    running = after;
  }

  if (running > DIFFICULTY.upperTailThreshold) {
    const after = DIFFICULTY.upperTailFloor + running / DIFFICULTY.upperTailDivisor;
    adjustments.push({
      id: "upperTailCompression",
      label: "Upper-tail compression",
      note: `${DIFFICULTY.upperTailFloor} + score ÷ ${DIFFICULTY.upperTailDivisor} (only above ${DIFFICULTY.upperTailThreshold})`,
      before: running,
      after,
    });
    running = after;
  }

  if (running > DIFFICULTY.maxDifficulty) {
    adjustments.push({
      id: "ceilingClamp",
      label: "Ceiling clamp",
      note: `score capped at ${DIFFICULTY.maxDifficulty}`,
      before: running,
      after: DIFFICULTY.maxDifficulty,
    });
    running = DIFFICULTY.maxDifficulty;
  }

  return {
    equation,
    terms,
    rawSubtotal,
    adjustments,
    final: round2(running),
  };
}
