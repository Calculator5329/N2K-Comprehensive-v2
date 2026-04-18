import { describe, expect, it } from "vitest";
import {
  ADV_BASE_TWO_CAP,
  ADV_DICE_RANGE,
  ADV_MAGNITUDE_CEIL,
  ADV_TARGET_RANGE,
  advMaxExponentFor,
} from "../src/core/constants.js";
import {
  distinctPermutations,
  evaluateLeftToRightN,
  permutations,
} from "../src/services/arithmetic.js";
import type { Operator } from "../src/core/types.js";

describe("advMaxExponentFor", () => {
  it("returns 1 for the degenerate dice values {-1, 0, 1}", () => {
    expect(advMaxExponentFor(-1)).toBe(1);
    expect(advMaxExponentFor(0)).toBe(1);
    expect(advMaxExponentFor(1)).toBe(1);
  });

  it("pins d=±2 to ADV_BASE_TWO_CAP", () => {
    expect(advMaxExponentFor(2)).toBe(ADV_BASE_TWO_CAP);
    expect(advMaxExponentFor(-2)).toBe(ADV_BASE_TWO_CAP);
  });

  it("computes the smallest power past 1,000,000 for non-trivial dice", () => {
    // Hand-verified against the table in docs/current_task.md.
    const expected: ReadonlyArray<readonly [number, number]> = [
      [3, 13], [4, 10], [5, 9], [6, 8], [7, 8], [8, 7], [9, 7], [10, 7],
      [11, 6], [12, 6], [13, 6], [14, 6], [15, 6],
      [16, 5], [17, 5], [20, 5], [31, 5],
      [32, 4],
    ];
    for (const [d, cap] of expected) {
      expect(advMaxExponentFor(d)).toBe(cap);
      expect(advMaxExponentFor(-d)).toBe(cap);
    }
  });

  it("each cap really is 'first power past 1M'", () => {
    for (let d = 2; d <= 32; d += 1) {
      const cap = advMaxExponentFor(d);
      if (d === 2) {
        // Cap is pinned by ADV_BASE_TWO_CAP, not the rule.
        expect(Math.pow(d, cap)).toBeGreaterThan(ADV_MAGNITUDE_CEIL);
        continue;
      }
      expect(Math.pow(d, cap)).toBeGreaterThan(ADV_MAGNITUDE_CEIL);
      expect(Math.pow(d, cap - 1)).toBeLessThanOrEqual(ADV_MAGNITUDE_CEIL);
    }
  });

  it("ADV_DICE_RANGE and ADV_TARGET_RANGE match the locked spec", () => {
    expect(ADV_DICE_RANGE).toEqual({ min: -10, max: 32 });
    expect(ADV_TARGET_RANGE).toEqual({ min: 1, max: 5_000 });
  });
});

describe("evaluateLeftToRightN", () => {
  it("matches the 3-arg version for arity 3", () => {
    // 2 + 3 * 4 -> (2 + 3) * 4 = 20
    expect(evaluateLeftToRightN([2, 3, 4], [1, 3] as Operator[])).toBe(20);
  });

  it("evaluates strictly left-to-right for higher arities", () => {
    // 1 + 2 + 3 * 4 -> ((1 + 2) + 3) * 4 = 24
    expect(evaluateLeftToRightN([1, 2, 3, 4], [1, 1, 3] as Operator[])).toBe(24);
    // 10 / 2 + 3 - 1 + 5 -> ((((10/2)+3)-1)+5) = 12
    expect(evaluateLeftToRightN([10, 2, 3, 1, 5], [4, 1, 2, 1] as Operator[])).toBe(12);
  });

  it("returns NaN on divide-by-zero", () => {
    expect(evaluateLeftToRightN([1, 0, 5], [4, 1] as Operator[])).toBeNaN();
  });

  it("returns NaN when an intermediate exceeds safeMagnitude", () => {
    // 1000 * 1000 = 1_000_000 — safeMagnitude 100_000 should bail.
    expect(evaluateLeftToRightN([1000, 1000], [3] as Operator[], 100_000)).toBeNaN();
    // Same chain with infinite guard returns the real product.
    expect(evaluateLeftToRightN([1000, 1000], [3] as Operator[])).toBe(1_000_000);
  });

  it("preserves negative values through the chain", () => {
    expect(evaluateLeftToRightN([-3, 4, -2], [3, 1] as Operator[])).toBe(-14); // (-3*4) + (-2)
  });

  it("throws on mismatched ops/values lengths", () => {
    expect(() => evaluateLeftToRightN([1, 2, 3], [1] as Operator[])).toThrow(/ops.length/);
  });

  it("returns NaN on empty values", () => {
    expect(evaluateLeftToRightN([], [])).toBeNaN();
  });
});

describe("permutations (Heap's algorithm)", () => {
  it("matches the 3-arg legacy helper exactly (as sets)", () => {
    const got = new Set([...permutations(["a", "b", "c"])].map((p) => p.join("")));
    expect(got).toEqual(new Set(["abc", "acb", "bac", "bca", "cab", "cba"]));
  });

  it("yields n! permutations for n=4 and n=5", () => {
    expect([...permutations([1, 2, 3, 4])].length).toBe(24);
    expect([...permutations([1, 2, 3, 4, 5])].length).toBe(120);
  });

  it("handles empty and single-element inputs", () => {
    expect([...permutations<number>([])]).toEqual([[]]);
    expect([...permutations([7])]).toEqual([[7]]);
  });

  it("yields independent arrays (mutation-safe)", () => {
    const all = [...permutations([1, 2, 3])];
    (all[0] as number[])[0] = 999;
    expect(all[1]).not.toContain(999);
  });
});

describe("distinctPermutations", () => {
  it("yields one permutation when all items are equal", () => {
    expect([...distinctPermutations([2, 2, 2])]).toEqual([[2, 2, 2]]);
  });

  it("dedupes (a, a, b) into 3 distinct orderings", () => {
    const got = [...distinctPermutations([1, 1, 2])].map((p) => p.join(""));
    expect(new Set(got)).toEqual(new Set(["112", "121", "211"]));
    expect(got.length).toBe(3);
  });

  it("matches n!/(multiplicities) for (a, a, b, c)", () => {
    // 4! / 2! = 12 distinct orderings
    expect([...distinctPermutations([1, 1, 2, 3])].length).toBe(12);
  });

  it("matches n!/(multiplicities) for (a, a, b, b, c)", () => {
    // 5! / (2! · 2!) = 30
    expect([...distinctPermutations([1, 1, 2, 2, 3])].length).toBe(30);
  });

  it("equals plain permutations when all items are distinct", () => {
    expect([...distinctPermutations([1, 2, 3, 4])].length).toBe(24);
  });

  it("handles negative and zero values", () => {
    const got = [...distinctPermutations([-1, 0, -1])].map((p) => p.join(","));
    expect(new Set(got)).toEqual(new Set(["-1,-1,0", "-1,0,-1", "0,-1,-1"]));
  });
});
