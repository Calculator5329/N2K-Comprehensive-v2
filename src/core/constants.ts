import type { DiceTriple, Operator, OperatorSymbol } from "./types.js";

/**
 * Maximum exponent allowed for each dice value, indexed by the dice value
 * itself. Caps the largest single base around ~10,000 to keep the brute-force
 * solver tractable. Index 0 is unused; index 1 is unused (dice are 2..20).
 *
 * Example: a dice value of 6 may be raised to exponents 0..MAX_EXPONENTS[6].
 */
export const MAX_EXPONENTS: readonly number[] = [
  1, 1, 13, 10, 6, 6, 10, 6, 6, 6, 10, 3, 10, 3, 3, 3, 3, 3, 10, 3, 3,
];

/** Operator codes used throughout the codebase. */
export const OP = {
  ADD: 1,
  SUB: 2,
  MUL: 3,
  DIV: 4,
} as const satisfies Record<string, Operator>;

/** Operator code -> printable symbol (used when rendering equations). */
export const OPERATOR_TO_SYMBOL: Readonly<Record<Operator, OperatorSymbol>> = {
  1: "+",
  2: "-",
  3: "*",
  4: "/",
};

/** Printable symbol -> operator code (used when parsing equations). */
export const SYMBOL_TO_OPERATOR: Readonly<Record<OperatorSymbol, Operator>> = {
  "+": 1,
  "-": 2,
  "*": 3,
  "/": 4,
};

/** Every operator code, in canonical order. Useful for enumeration. */
export const ALL_OPERATORS: readonly Operator[] = [1, 2, 3, 4];

/**
 * Returns true if a dice triple is legal under N2K's roll rules.
 *
 * Two rules are enforced:
 *   1. **All-same triples** (e.g. `(5, 5, 5)`) — the original game forbids
 *      these because every operator collapses to a degenerate single value.
 *   2. **More than one `1`** (e.g. `(1, 1, 4)`, `(1, 1, 1)`) — at least two
 *      `1`s leaves the third die effectively alone after multiplication or
 *      division by 1, so the roll never produces an interesting equation.
 *      Triples with exactly one `1` (e.g. `(3, 3, 1)`) are still legal.
 *
 * Order does not matter; the predicate works on any permutation.
 */
export function isLegalDiceTriple(triple: DiceTriple): boolean {
  const [a, b, c] = triple;
  if (a === b && b === c) return false;
  const ones = (a === 1 ? 1 : 0) + (b === 1 ? 1 : 0) + (c === 1 ? 1 : 0);
  if (ones >= 2) return false;
  return true;
}

/** Canonical list of dice combinations used for board difficulty analysis. */
export const DICE_COMBINATIONS: readonly DiceTriple[] = [
  [2, 2, 2],  [2, 2, 3],  [2, 2, 5],  [2, 2, 6],  [2, 2, 7],  [2, 2, 10],
  [2, 3, 3],  [2, 3, 5],  [2, 3, 6],  [2, 3, 7],  [2, 3, 10], [2, 3, 11],
  [2, 3, 12], [2, 3, 13], [2, 3, 14], [2, 3, 15], [2, 3, 17], [2, 3, 18],
  [2, 3, 19], [2, 3, 20], [2, 5, 5],  [2, 5, 6],  [2, 5, 10], [2, 6, 6],
  [2, 6, 7],  [2, 6, 12], [3, 3, 5],  [3, 3, 6],  [3, 3, 12], [3, 5, 5],
  [3, 5, 6],  [3, 5, 7],  [3, 5, 15], [3, 6, 6],  [3, 6, 7],  [3, 6, 10],
  [3, 6, 12], [3, 6, 18],
];

/**
 * Difficulty formula weights. Each term contributes additively to the raw
 * difficulty score before smoothing/clamping.
 *
 * These constants were calibrated empirically by playtesting; do not change
 * them without re-validating against known difficulty rankings.
 */
export const DIFFICULTY = {
  totalSqrtWeight: 1,
  shortestDistanceWeight: 1 / 12,
  zeroExponentPenaltyPerCount: 1 / 0.45,
  oneExponentPenaltyPerCount: 1 / 0.7,
  largestNumSqrtWeight: 1 / 16,
  largestNumDistanceWeight: 1 / 7,
  smallestMultiplierExponent: 0.75,
  smallestMultiplierWeight: 1 / 2,

  /** Smoothing applied when one of the multiplied bases is 10. */
  tenFlagOffset: 5,
  tenFlagDivisor: 1.75,

  /** Compression applied to the upper tail of the score distribution. */
  upperTailThreshold: 90,
  upperTailFloor: 99,
  upperTailDivisor: 5000,

  /** Hard ceiling on the published difficulty score. */
  maxDifficulty: 100,
} as const;

/** Standard N2K board dimensions. */
export const BOARD = {
  rows: 6,
  cols: 6,
  /** Total cells on a board. */
  size: 36,
} as const;

/** Difficulty buckets used by the board summary report. */
export const DIFFICULTY_BUCKETS: ReadonlyArray<readonly [number, number]> = [
  [0, 10],
  [10, 20],
  [20, 30],
  [30, 40],
  [40, 50],
  [50, 65],
  [65, 80],
  [80, 100],
];

/**
 * Tolerance used when comparing floating-point equation results to an integer
 * total. Required because the solver allows division and chained
 * multiplication, which can introduce tiny rounding errors.
 */
export const FLOAT_EQ_EPSILON = 1e-9;

// ---------------------------------------------------------------------------
//  Advanced Mode (the secret Æther edition) — separate constant tables so
//  the standard mode's data and tests are completely unaffected.
// ---------------------------------------------------------------------------

/** Inclusive dice value range for advanced mode. Negative dice are literal. */
export const ADV_DICE_RANGE = { min: -10, max: 32 } as const;

/** Inclusive integer target range for advanced mode. */
export const ADV_TARGET_RANGE = { min: 1, max: 5_000 } as const;

/**
 * Magnitude ceiling that drives the advanced exponent caps. The cap for a
 * dice value `d` is the smallest exponent `p` such that `|d|^p` exceeds
 * this number — see {@link advMaxExponentFor}.
 */
export const ADV_MAGNITUDE_CEIL = 1_000_000;

/**
 * Explicit cap for `d = ±2`. The generic "first power past 1M" rule would
 * give `2^20 = 1,048,576`, so this matches the rule but is pinned in case
 * we ever bump {@link ADV_MAGNITUDE_CEIL} and don't want d=2 to drift.
 */
export const ADV_BASE_TWO_CAP = 20;

/**
 * Intermediate-result magnitude guard. Equations whose left-to-right
 * partial sum/product exceeds this absolute value are pruned before the
 * next operator is applied. `2^45` leaves slack for one more multiply
 * inside `Number.MAX_SAFE_INTEGER` (`2^53`).
 */
export const ADV_SAFE_MAGNITUDE = 2 ** 45;

/**
 * Maximum exponent (inclusive) for a dice value in advanced mode.
 *
 *   - `|d| ≤ 1` → 1 (degenerate: 0, ±1 don't grow with exponentiation).
 *   - `|d| = 2` → {@link ADV_BASE_TWO_CAP}.
 *   - otherwise → smallest `p` such that `|d|^p > ADV_MAGNITUDE_CEIL`.
 *
 * Sign of `dice` is irrelevant — caps mirror across zero.
 */
export function advMaxExponentFor(dice: number): number {
  const abs = Math.abs(dice);
  if (abs <= 1) return 1;
  if (abs === 2) return ADV_BASE_TWO_CAP;
  let p = 1;
  let v = abs;
  while (v <= ADV_MAGNITUDE_CEIL) {
    p += 1;
    v *= abs;
  }
  return p;
}

/**
 * Advanced-mode difficulty heuristic weights. Inspired by {@link DIFFICULTY}
 * but arity-agnostic, sign-aware, and magnitude-aware.
 *
 * Calibrated to roughly match the standard heuristic on overlapping
 * inputs (3 dice, all positive, exponents ≤ 9) while penalizing the new
 * dimensions advanced mode opens up: extra dice, negative bases, and
 * exponents far above what humans can intuit.
 *
 * Like the standard heuristic, these were picked by playtesting; do not
 * change them without re-validating against known difficulty rankings.
 */
export const ADV_DIFFICULTY = {
  totalSqrtWeight: 1,
  shortestDistanceWeight: 1 / 12,
  zeroExponentPenaltyPerCount: 1 / 0.45,
  oneExponentPenaltyPerCount: 1 / 0.7,
  largestNumSqrtWeight: 1 / 16,
  largestNumDistanceWeight: 1 / 7,

  /** Per-multiplication smallest-multiplicand penalty. */
  smallestMultiplierExponent: 0.75,
  smallestMultiplierWeight: 1 / 2,
  /** Each subsequent multiplication contributes its smallest-multiplicand
   * penalty scaled by 1/(k+1) for chain position k (0-indexed). */
  multiplierChainDecay: true,

  /** Penalty per extra dice beyond the standard 3. */
  arityPenaltyPerExtraDice: 5,
  /** Penalty per negative base in the equation. */
  negativeBasePenaltyPerCount: 3,
  /** Exponents above this contribute a per-overshoot penalty. */
  hugeExponentThreshold: 6,
  hugeExponentWeightPerOver: 0.5,

  /** Smoothing applied when one of the multiplied bases is ±10. */
  tenFlagOffset: 5,
  tenFlagDivisor: 1.75,

  /** Compression applied to the upper tail of the score distribution. */
  upperTailThreshold: 90,
  upperTailFloor: 99,
  upperTailDivisor: 5000,

  /** Hard ceiling on the published difficulty score. */
  maxDifficulty: 100,
} as const;
