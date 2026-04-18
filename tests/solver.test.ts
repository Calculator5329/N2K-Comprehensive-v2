import { describe, expect, it } from "vitest";
import { evaluateLeftToRight } from "../src/services/arithmetic.js";
import { difficultyOfEquation } from "../src/services/difficulty.js";
import { allSolutions, easiestSolution } from "../src/services/solver.js";
import type { Equation } from "../src/core/types.js";

function evaluate(eq: Equation): number {
  return evaluateLeftToRight(
    Math.pow(eq.d1, eq.p1),
    Math.pow(eq.d2, eq.p2),
    Math.pow(eq.d3, eq.p3),
    eq.o1,
    eq.o2,
  );
}

describe("easiestSolution", () => {
  it("returns null when no equation can hit the target", () => {
    // Three 2s cannot reach 1,000,000 within the exponent caps.
    const result = easiestSolution({ dice: [2, 2, 2], total: 1_000_000 });
    expect(result).toBeNull();
  });

  it("solves a trivial addition target", () => {
    const result = easiestSolution({ dice: [2, 3, 5], total: 10 });
    expect(result).not.toBeNull();
    expect(result!.total).toBe(10);
    // The returned equation must actually evaluate to the target,
    // regardless of which operators/permutation the solver picked.
    expect(evaluate(result!)).toBeCloseTo(10, 6);
  });

  it("uses exponentiation when needed", () => {
    // 2^5 + 2^2 + 2^2 = 40 is the canonical example from the README.
    const result = easiestSolution({ dice: [2, 2, 2], total: 40 });
    expect(result).not.toBeNull();
    expect(evaluate(result!)).toBeCloseTo(40, 6);
    // Confirm a power > 1 is used somewhere — additive 2s alone cannot reach 40.
    const { p1, p2, p3 } = result!;
    expect(Math.max(p1, p2, p3)).toBeGreaterThan(1);
  });

  it("handles division targets via float-tolerant comparison", () => {
    // 6 / 2 + 2 = 5
    const result = easiestSolution({ dice: [6, 2, 2], total: 5 });
    expect(result).not.toBeNull();
    expect(evaluate(result!)).toBeCloseTo(5, 6);
  });

  it("treats 8 as a power of 2 (depower)", () => {
    const result = easiestSolution({ dice: [8, 8, 8], total: 64 });
    expect(result).not.toBeNull();
    // Solver should report base 2, not 8 (because 8 is depowered).
    expect(result!.d1).toBe(2);
  });
});

describe("allSolutions", () => {
  it("returns an empty list for unsolvable cells", () => {
    expect(allSolutions({ dice: [2, 2, 2], total: 1_000_000 })).toEqual([]);
  });

  it("returns multiple equations for a target with many solutions", () => {
    const all = allSolutions({ dice: [2, 3, 5], total: 10 });
    expect(all.length).toBeGreaterThan(1);
    for (const { equation, difficulty } of all) {
      expect(evaluate(equation)).toBeCloseTo(10, 6);
      expect(Number.isFinite(difficulty)).toBe(true);
    }
  });

  it("is sorted by difficulty ascending", () => {
    const all = allSolutions({ dice: [2, 3, 5], total: 10 });
    for (let i = 1; i < all.length; i += 1) {
      expect(all[i]!.difficulty).toBeGreaterThanOrEqual(all[i - 1]!.difficulty);
    }
  });

  it("first entry matches easiestSolution's difficulty", () => {
    const all = allSolutions({ dice: [2, 2, 2], total: 40 });
    const easiest = easiestSolution({ dice: [2, 2, 2], total: 40 });
    expect(all.length).toBeGreaterThan(0);
    expect(easiest).not.toBeNull();
    // The easiest's score is the minimum across allSolutions, and that
    // minimum is what `easiestSolution` returns. We compare scores rather
    // than full equations because ties can pick different winners depending
    // on iteration order.
    const minScore = Math.min(...all.map((s) => s.difficulty));
    expect(all[0]!.difficulty).toBe(minScore);
    expect(difficultyOfEquation(easiest!)).toBe(minScore);
  });
});
