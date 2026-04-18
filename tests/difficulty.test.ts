import { describe, expect, it } from "vitest";
import {
  difficultyBreakdown,
  difficultyOfEquation,
} from "../src/services/difficulty.js";
import type { Equation } from "../src/core/types.js";

function eq(partial: Partial<Equation>): Equation {
  return {
    d1: 2, d2: 2, d3: 2,
    p1: 0, p2: 0, p3: 0,
    o1: 1, o2: 1,
    total: 0,
    ...partial,
  };
}

describe("difficultyOfEquation", () => {
  it("rounds to two decimal places", () => {
    const score = difficultyOfEquation(eq({ total: 50 }));
    expect(Math.round(score * 100) / 100).toBe(score);
  });

  it("clamps absurdly hard equations to <= 100", () => {
    const score = difficultyOfEquation(
      eq({ d1: 6, d2: 6, d3: 6, p1: 7, p2: 7, p3: 7, total: 999_999 }),
    );
    expect(score).toBeLessThanOrEqual(100);
  });

  it("distinguishes ^0 from ^1 exponents (regression test for Python `ones` bug)", () => {
    // Two equations with the SAME everything except exponent shape:
    //   A) p = (0, 0, 0)   -> three zero-exponents
    //   B) p = (1, 1, 1)   -> three one-exponents
    // The original Python counted both as "zeroes" so the difficulty was
    // identical. The fix gives them different penalties, hence different
    // scores.
    const a = difficultyOfEquation(eq({ d1: 5, d2: 5, d3: 5, p1: 0, p2: 0, p3: 0, total: 3 }));
    const b = difficultyOfEquation(eq({ d1: 5, d2: 5, d3: 5, p1: 1, p2: 1, p3: 1, total: 15 }));
    expect(a).not.toBe(b);
  });

  it("applies the x10 smoothing when a multiplied base is 10", () => {
    const withTen = difficultyOfEquation(
      eq({ d1: 10, d2: 5, d3: 2, p1: 1, p2: 1, p3: 1, o1: 3, o2: 1, total: 52 }),
    );
    const withoutTen = difficultyOfEquation(
      eq({ d1: 9, d2: 5, d3: 2, p1: 1, p2: 1, p3: 1, o1: 3, o2: 1, total: 47 }),
    );
    expect(withTen).toBeLessThan(withoutTen);
  });
});

describe("difficultyBreakdown", () => {
  /**
   * The breakdown's `final` is the source of truth for `difficultyOfEquation`,
   * so they cannot drift. Spot-check across a representative slice of the
   * input space to make sure the refactor stays watertight.
   */
  it("agrees with difficultyOfEquation across a sweep", () => {
    const samples: Equation[] = [
      eq({ total: 1 }),
      eq({ d1: 5, d2: 5, d3: 5, p1: 0, p2: 0, p3: 0, total: 3 }),
      eq({ d1: 2, d2: 3, d3: 5, p1: 5, p2: 0, p3: 0, o1: 1, o2: 2, total: 31 }),
      eq({ d1: 10, d2: 5, d3: 2, p1: 1, p2: 1, p3: 1, o1: 3, o2: 1, total: 52 }),
      eq({ d1: 6, d2: 6, d3: 6, p1: 7, p2: 7, p3: 7, total: 999_999 }),
    ];
    for (const sample of samples) {
      const breakdown = difficultyBreakdown(sample);
      expect(breakdown.final).toBe(difficultyOfEquation(sample));
    }
  });

  it("lists every additive term and they sum to rawSubtotal", () => {
    const breakdown = difficultyBreakdown(
      eq({ d1: 2, d2: 3, d3: 5, p1: 5, p2: 0, p3: 0, o1: 1, o2: 2, total: 31 }),
    );
    expect(breakdown.terms).toHaveLength(7);
    const sum = breakdown.terms.reduce((acc, t) => acc + t.contribution, 0);
    expect(sum).toBeCloseTo(breakdown.rawSubtotal, 10);
  });

  it("records the ten-flag adjustment when one of the multiplied bases is 10", () => {
    const withTen = difficultyBreakdown(
      eq({ d1: 10, d2: 5, d3: 2, p1: 1, p2: 1, p3: 1, o1: 3, o2: 1, total: 52 }),
    );
    expect(withTen.adjustments.some((a) => a.id === "tenFlag")).toBe(true);

    const withoutTen = difficultyBreakdown(
      eq({ d1: 9, d2: 5, d3: 2, p1: 1, p2: 1, p3: 1, o1: 3, o2: 1, total: 47 }),
    );
    expect(withoutTen.adjustments.some((a) => a.id === "tenFlag")).toBe(false);
  });

  it("records the ceiling clamp on absurdly hard equations", () => {
    const breakdown = difficultyBreakdown(
      eq({ d1: 6, d2: 6, d3: 6, p1: 7, p2: 7, p3: 7, total: 999_999 }),
    );
    expect(breakdown.final).toBeLessThanOrEqual(100);
    // upperTailCompression always fires before the clamp on this input.
    const ids = breakdown.adjustments.map((a) => a.id);
    expect(ids).toContain("upperTailCompression");
  });
});
