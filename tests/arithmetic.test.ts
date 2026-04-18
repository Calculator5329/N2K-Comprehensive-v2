import { describe, expect, it } from "vitest";
import {
  applyOperator,
  evaluateLeftToRight,
  permutationsOf3,
} from "../src/services/arithmetic.js";

describe("applyOperator", () => {
  it("supports the four operators", () => {
    expect(applyOperator(2, 3, 1)).toBe(5);
    expect(applyOperator(5, 2, 2)).toBe(3);
    expect(applyOperator(4, 3, 3)).toBe(12);
    expect(applyOperator(10, 4, 4)).toBe(2.5);
  });
});

describe("evaluateLeftToRight", () => {
  it("evaluates strictly left-to-right (no precedence)", () => {
    // 2 + 3 * 4 -> (2 + 3) * 4 = 20, NOT 14
    expect(evaluateLeftToRight(2, 3, 4, 1, 3)).toBe(20);
    // 8 / 2 - 1 -> 3
    expect(evaluateLeftToRight(8, 2, 1, 4, 2)).toBe(3);
  });
});

describe("permutationsOf3", () => {
  it("returns all 6 distinct permutations", () => {
    const perms = permutationsOf3("a", "b", "c");
    expect(perms).toHaveLength(6);
    const stringified = new Set(perms.map((p) => p.join("")));
    expect(stringified).toEqual(
      new Set(["abc", "acb", "bac", "bca", "cab", "cba"]),
    );
  });
});
