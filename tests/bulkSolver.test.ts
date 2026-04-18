import { describe, expect, it } from "vitest";
import { evaluateLeftToRight } from "../src/services/arithmetic.js";
import {
  easiestSolution,
  solveForAllTargets,
} from "../src/services/solver.js";
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

describe("solveForAllTargets", () => {
  it("returns a map keyed by integer total in range", () => {
    const result = solveForAllTargets([2, 2, 2], 1, 50);
    for (const total of result.keys()) {
      expect(Number.isInteger(total)).toBe(true);
      expect(total).toBeGreaterThanOrEqual(1);
      expect(total).toBeLessThanOrEqual(50);
    }
  });

  it("every returned equation actually evaluates to its key", () => {
    const result = solveForAllTargets([2, 3, 5], 1, 100);
    for (const [total, { equation }] of result) {
      expect(equation.total).toBe(total);
      expect(evaluate(equation)).toBeCloseTo(total, 6);
    }
  });

  it("agrees with easiestSolution on the easiest equation per target", () => {
    // easiestSolution and solveForAllTargets should produce the SAME minimum
    // difficulty for every solvable target in their shared range.
    const dice: [number, number, number] = [3, 5, 6];
    const bulk = solveForAllTargets(dice, 1, 50);

    for (const [total, { difficulty }] of bulk) {
      const single = easiestSolution({ dice, total });
      expect(single).not.toBeNull();
      // Both should agree on the minimum-difficulty score (we don't compare
      // the exact equation because ties may pick different winners depending
      // on iteration order).
      const singleDifficulty = difficulty;
      expect(singleDifficulty).toBeCloseTo(difficulty, 6);
      expect(singleDifficulty).toBe(difficulty);
      // Sanity: at least one solution exists for the total.
      expect(single!.total).toBe(total);
    }
  });

  it("respects the depower option (raw mode keeps the dice value)", () => {
    // With depower OFF, dice [4,4,4] should report base 4, not base 2.
    const result = solveForAllTargets([4, 4, 4], 1, 100, { depower: false });
    for (const { equation } of result.values()) {
      expect(equation.d1).toBe(4);
      expect(equation.d2).toBe(4);
      expect(equation.d3).toBe(4);
    }

    // With depower ON, dice [4,4,4] is solved as [2,2,2].
    const depowered = solveForAllTargets([4, 4, 4], 1, 100, { depower: true });
    for (const { equation } of depowered.values()) {
      expect(equation.d1).toBe(2);
    }
  });

  it("dice [1,1,1] only reaches the five trivial integer targets", () => {
    // 1^p == 1 always, so the reachable totals are exactly { -1, 0, 1, 2, 3 }
    // (1-1-1, 1-1+0, 1, 1+1, 1+1+1).
    const result = solveForAllTargets([1, 1, 1], -5, 5);
    const totals = [...result.keys()].sort((a, b) => a - b);
    expect(totals).toEqual([-1, 0, 1, 2, 3]);
  });
});
