import { ADV_DIFFICULTY, OP, advMaxExponentFor } from "../core/constants.js";
import type { NEquation } from "../core/types.js";
import { applyOperator } from "./arithmetic.js";

/**
 * Bag of every reachable single-base value `d^p` for the dice in an
 * equation, used by the heuristic's "distance from a free base power"
 * term. Computed once per dice tuple and reused across every candidate
 * equation hitting that tuple.
 */
export interface AllBasesCache {
  readonly values: readonly number[];
}

/** Build the {@link AllBasesCache} for a dice tuple. */
export function buildAllBasesCache(dice: readonly number[]): AllBasesCache {
  const values: number[] = [];
  for (const d of dice) {
    const cap = advMaxExponentFor(d);
    for (let p = 0; p <= cap; p += 1) values.push(Math.pow(d, p));
  }
  return { values };
}

/**
 * Advanced-mode difficulty heuristic. Inspired by `difficultyOfEquation`
 * in `services/difficulty.ts` but arity-agnostic, sign-aware, and
 * magnitude-aware. See `ADV_DIFFICULTY` in `core/constants.ts` for the
 * full list of weights.
 *
 * Pass `precomputed` to amortize the all-bases scan across many
 * candidate equations sharing the same dice tuple (the solver hot loop
 * does this).
 */
export function advDifficultyOfEquation(
  eq: NEquation,
  precomputed?: AllBasesCache,
): number {
  const { dice, exps, ops, total } = eq;
  const N = dice.length;

  // 1) Distance from a free base power.
  const allBases = (precomputed ?? buildAllBasesCache(dice)).values;
  let shortestDistance = Number.POSITIVE_INFINITY;
  for (const base of allBases) {
    const d = Math.abs(base - total);
    if (d < shortestDistance) shortestDistance = d;
  }

  // 2) Exponent shape.
  let zeroes = 0;
  let ones = 0;
  for (const p of exps) {
    if (p === 0) zeroes += 1;
    else if (p === 1) ones += 1;
  }

  // 3) Walk left-to-right, tracking max(|partial|), every multiplication's
  //    smallest multiplicand, and whether any ×10 simplification fires.
  const baseValue = (i: number): number => Math.pow(dice[i]!, exps[i]!);
  let acc = baseValue(0);
  let maxAbs = Math.abs(acc);
  let multiplierTerm = 0;
  let mulIdx = 0;
  let tenFlag = false;
  for (let i = 0; i < ops.length; i += 1) {
    const next = baseValue(i + 1);
    const op = ops[i]!;
    if (op === OP.MUL) {
      const sm = Math.min(Math.abs(acc), Math.abs(next));
      if (sm > 1) {
        const decay = ADV_DIFFICULTY.multiplierChainDecay ? mulIdx + 1 : 1;
        multiplierTerm +=
          (Math.pow(sm, ADV_DIFFICULTY.smallestMultiplierExponent) *
            ADV_DIFFICULTY.smallestMultiplierWeight) /
          decay;
      }
      if (Math.abs(dice[i]!) === 10 || Math.abs(dice[i + 1]!) === 10) {
        tenFlag = true;
      }
      mulIdx += 1;
    }
    acc = applyOperator(acc, next, op);
    const absAcc = Math.abs(acc);
    if (absAcc > maxAbs) maxAbs = absAcc;
  }
  const largestNum = maxAbs;
  const largestNumDistance = Math.abs(largestNum - total);

  // 4) Huge-exponent penalty.
  let hugeExpTerm = 0;
  for (const p of exps) {
    if (p > ADV_DIFFICULTY.hugeExponentThreshold) {
      hugeExpTerm +=
        (p - ADV_DIFFICULTY.hugeExponentThreshold) *
        ADV_DIFFICULTY.hugeExponentWeightPerOver;
    }
  }

  // 5) Arity and negative-base penalties.
  const arityTerm = (N - 3) * ADV_DIFFICULTY.arityPenaltyPerExtraDice;
  let negCount = 0;
  for (const d of dice) if (d < 0) negCount += 1;
  const negTerm = negCount * ADV_DIFFICULTY.negativeBasePenaltyPerCount;

  // 6) Compose.
  const totalMagnitude =
    Math.sqrt(Math.abs(total)) * ADV_DIFFICULTY.totalSqrtWeight;
  const shortestDistanceTerm =
    shortestDistance * ADV_DIFFICULTY.shortestDistanceWeight;
  const zeroesTerm = -zeroes * ADV_DIFFICULTY.zeroExponentPenaltyPerCount;
  const onesTerm = -ones * ADV_DIFFICULTY.oneExponentPenaltyPerCount;
  const largestSqrtTerm =
    Math.sqrt(largestNum) * ADV_DIFFICULTY.largestNumSqrtWeight;
  const largestDistanceTerm =
    largestNumDistance * ADV_DIFFICULTY.largestNumDistanceWeight;

  let raw =
    totalMagnitude +
    shortestDistanceTerm +
    zeroesTerm +
    onesTerm +
    largestSqrtTerm +
    largestDistanceTerm +
    multiplierTerm +
    hugeExpTerm +
    arityTerm +
    negTerm;

  if (tenFlag) {
    raw = (raw - ADV_DIFFICULTY.tenFlagOffset) / ADV_DIFFICULTY.tenFlagDivisor;
  }
  if (raw > ADV_DIFFICULTY.upperTailThreshold) {
    raw =
      ADV_DIFFICULTY.upperTailFloor +
      raw / ADV_DIFFICULTY.upperTailDivisor;
  }
  if (raw > ADV_DIFFICULTY.maxDifficulty) raw = ADV_DIFFICULTY.maxDifficulty;
  if (raw < 0) raw = 0;

  return Math.round(raw * 100) / 100;
}
