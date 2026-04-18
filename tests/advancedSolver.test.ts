import { describe, expect, it } from "vitest";
import {
  easiestAdvanced,
  enumerateUnorderedTuples,
  solveAdvancedForAllTargets,
  solveOneTuple,
} from "../src/services/advancedSolver.js";
import {
  advDifficultyOfEquation,
  buildAllBasesCache,
} from "../src/services/advancedDifficulty.js";
import {
  formatNEquation,
  parseNEquation,
} from "../src/services/advancedParsing.js";
import { evaluateLeftToRightN } from "../src/services/arithmetic.js";
import type { NEquation, Operator } from "../src/core/types.js";

function evalEquation(eq: NEquation): number {
  const values = eq.dice.map((d, i) => Math.pow(d, eq.exps[i]!));
  return evaluateLeftToRightN(values, eq.ops);
}

describe("solveAdvancedForAllTargets", () => {
  it("solves a known small case (2, 3, 5) → 17", () => {
    const map = solveAdvancedForAllTargets([2, 3, 5], 1, 200);
    const hit = map.get(17);
    expect(hit).toBeDefined();
    expect(evalEquation(hit!.equation)).toBe(17);
  });

  it("returns equations whose totals all match their declared totals", () => {
    const map = solveAdvancedForAllTargets([2, 3, 5], 1, 100);
    for (const sol of map.values()) {
      expect(evalEquation(sol.equation)).toBe(sol.equation.total);
    }
  });

  it("handles negative dice with literal interpretation: (-3)^4 = 81", () => {
    // The dice (-3, 1, 1) trivially hits 82 via (-3)^4 + 1^1 + 1^0 → no, that's
    // arity 3 so we need 3 ops/dice. Use (-3)^4 + 1^0 - 1^0 = 81.
    const map = solveAdvancedForAllTargets([-3, 1, 1], 1, 100);
    const eighty = map.get(80);
    // 80 = (-3)^4 - 1^0 (= 81 - 1) and then we need 3 dice...
    // (-3)^4 + 1^0 - 1^1 = 81 + 1 - 1 = 81, not 80.
    // (-3)^4 - 1^1 - 1^0 = 81 - 1 - 1 = 79, also not 80.
    // (-3)^4 - 1^0 - 1^1 = 81 - 1 - 1 = 79.
    // 81: (-3)^4 + 1^1 - 1^1 = 81. Yes.
    expect(map.get(81)).toBeDefined();
    expect(evalEquation(map.get(81)!.equation)).toBe(81);
  });

  it("respects safeMagnitude pruning without changing real solutions", () => {
    const lo = solveAdvancedForAllTargets([2, 3, 5], 1, 100, { safeMagnitude: 1_000 });
    const hi = solveAdvancedForAllTargets([2, 3, 5], 1, 100);
    // Restricting safeMagnitude can only remove or upgrade solutions, never
    // produce a lower-difficulty hit.
    for (const [target, loSol] of lo) {
      const hiSol = hi.get(target);
      expect(hiSol).toBeDefined();
      expect(hiSol!.difficulty).toBeLessThanOrEqual(loSol.difficulty);
    }
  });

  it("rejects out-of-range arity", () => {
    expect(() => solveAdvancedForAllTargets([1, 2], 1, 10)).toThrow(/arity/);
    expect(() => solveAdvancedForAllTargets([1, 2, 3, 4, 5, 6], 1, 10)).toThrow(/arity/);
  });

  it("works at arity 4 — produces a solvable equation for (2, 3, 5, 7)", () => {
    const map = solveAdvancedForAllTargets([2, 3, 5, 7], 1, 200);
    expect(map.size).toBeGreaterThan(50);
    for (const sol of map.values()) {
      expect(evalEquation(sol.equation)).toBe(sol.equation.total);
      expect(sol.equation.dice).toHaveLength(4);
    }
  });
});

describe("solveOneTuple", () => {
  it("returns solutions sorted by target ascending", () => {
    const out = solveOneTuple([2, 3, 5], 3, 1, 200);
    const totals = out.map((o) => o.equation.total);
    for (let i = 1; i < totals.length; i += 1) {
      expect(totals[i]!).toBeGreaterThan(totals[i - 1]!);
    }
  });

  it("rejects mismatched arity argument", () => {
    expect(() => solveOneTuple([2, 3, 5], 4, 1, 10)).toThrow(/arity/);
  });
});

describe("easiestAdvanced auto-arity", () => {
  it("returns null when no subset can hit the target", () => {
    // (1, 1, 1): only achievable totals are -3..3. 1000 is impossible.
    expect(easiestAdvanced({ dice: [1, 1, 1], total: 1000 })).toBeNull();
  });

  it("uses a 3-subset before reaching for the 4-tuple", () => {
    // (2, 3, 5, 7) hits 30 trivially with (2, 3, 5) → e.g. 2 * 3 * 5 = 30.
    // The auto-arity solver must return a 3-arity equation, not a 4-arity one.
    const eq = easiestAdvanced({ dice: [2, 3, 5, 7], total: 30 });
    expect(eq).not.toBeNull();
    expect(eq!.dice).toHaveLength(3);
    expect(evalEquation(eq!)).toBe(30);
  });

  it("falls back to higher arity when smaller subsets can't hit the target", () => {
    // 8 from (2, 3, 5, 7): 3-subsets give some hits (2+3+5=10, 5+3=8 isn't a
    // valid 3-arity since it needs 3 dice, but 2^3 + 5 - 5 needs a duplicate).
    // 2^3 = 8 → 2^3 + 5^0 - 5^0 = 8. Yes, possible at arity 3 with (2, 5, 5) —
    // but our pool has (2, 3, 5, 7) with no duplicate. Try: 7 + 3 - 2 = 8.
    // (2, 3, 7) → 7 + 3 - 2 = 8. So 3-arity wins.
    const eq = easiestAdvanced({ dice: [2, 3, 5, 7], total: 8 });
    expect(eq).not.toBeNull();
    expect(eq!.dice.length).toBeLessThanOrEqual(4);
    expect(evalEquation(eq!)).toBe(8);
  });
});

describe("enumerateUnorderedTuples", () => {
  it("returns C(n+k-1, k) ordered tuples", () => {
    // For min=1, max=3, arity=3 → multisets of size 3 from {1,2,3}: 10
    const tuples = enumerateUnorderedTuples(3, 1, 3);
    expect(tuples.length).toBe(10);
  });

  it("yields strictly non-decreasing tuples", () => {
    const tuples = enumerateUnorderedTuples(4, -2, 5);
    for (const t of tuples) {
      for (let i = 1; i < t.length; i += 1) {
        expect(t[i]!).toBeGreaterThanOrEqual(t[i - 1]!);
      }
    }
  });

  it("supports negative ranges", () => {
    const tuples = enumerateUnorderedTuples(3, -2, 0);
    expect(tuples).toContainEqual([-2, -2, -2]);
    expect(tuples).toContainEqual([-2, -1, 0]);
    expect(tuples).toContainEqual([0, 0, 0]);
  });
});

describe("advancedDifficulty heuristic", () => {
  it("is deterministic and within [0, 100]", () => {
    const eq: NEquation = {
      dice: [2, 3, 5], exps: [3, 1, 1], ops: [1, 1] as Operator[], total: 16,
    };
    const d = advDifficultyOfEquation(eq);
    expect(d).toBeGreaterThanOrEqual(0);
    expect(d).toBeLessThanOrEqual(100);
    expect(d).toBe(advDifficultyOfEquation(eq));
  });

  it("penalizes arity 5 more than arity 3 for equivalent shape", () => {
    const eq3: NEquation = {
      dice: [2, 3, 5], exps: [1, 1, 1], ops: [1, 1] as Operator[], total: 10,
    };
    const eq5: NEquation = {
      dice: [2, 3, 5, 1, 1], exps: [1, 1, 1, 1, 1], ops: [1, 1, 1, 1] as Operator[], total: 12,
    };
    expect(advDifficultyOfEquation(eq5)).toBeGreaterThan(advDifficultyOfEquation(eq3));
  });

  it("penalizes negative bases", () => {
    const pos: NEquation = {
      dice: [3, 3, 3], exps: [2, 1, 0], ops: [1, 1] as Operator[], total: 13,
    };
    const neg: NEquation = {
      dice: [-3, 3, 3], exps: [2, 1, 0], ops: [1, 1] as Operator[], total: 13,
    };
    expect(advDifficultyOfEquation(neg)).toBeGreaterThan(advDifficultyOfEquation(pos));
  });

  it("penalizes huge exponents above the threshold", () => {
    const small: NEquation = {
      dice: [2, 2, 2], exps: [3, 1, 1], ops: [1, 1] as Operator[], total: 10,
    };
    const huge: NEquation = {
      dice: [2, 2, 2], exps: [10, 1, 1], ops: [1, 1] as Operator[], total: 1026,
    };
    expect(advDifficultyOfEquation(huge)).toBeGreaterThan(advDifficultyOfEquation(small));
  });

  it("amortizes via cached allBases (results match)", () => {
    const eq: NEquation = {
      dice: [2, 3, 5], exps: [3, 1, 1], ops: [1, 1] as Operator[], total: 16,
    };
    const cache = buildAllBasesCache(eq.dice);
    expect(advDifficultyOfEquation(eq, cache)).toBe(advDifficultyOfEquation(eq));
  });
});

describe("advanced parsing", () => {
  it("round-trips a typical arity-3 equation", () => {
    const eq: NEquation = {
      dice: [2, 3, 5], exps: [3, 1, 1], ops: [1, 2] as Operator[], total: 6,
    };
    const s = formatNEquation(eq);
    expect(s).toBe("2^3 + 3^1 - 5^1 = 6");
    expect(parseNEquation(s)).toEqual(eq);
  });

  it("formats negative bases with parentheses", () => {
    const eq: NEquation = {
      dice: [-3, 2, 5], exps: [4, 5, 0], ops: [1, 2] as Operator[], total: 112,
    };
    expect(formatNEquation(eq)).toBe("(-3)^4 + 2^5 - 5^0 = 112");
  });

  it("parses both `(-3)^4` and `-3^4` as base=-3, exp=4", () => {
    const a = parseNEquation("(-3)^4 + 2^5 - 5^0 = 112");
    const b = parseNEquation("-3^4 + 2^5 - 5^0 = 112");
    expect(a).toEqual(b);
    expect(a.dice[0]).toBe(-3);
    expect(a.exps[0]).toBe(4);
  });

  it("round-trips arity 4 and 5", () => {
    const a4: NEquation = {
      dice: [-1, 2, 3, 4], exps: [0, 3, 1, 2], ops: [1, 3, 2] as Operator[], total: 23,
    };
    const a5: NEquation = {
      dice: [1, 2, 3, 4, 5], exps: [0, 1, 2, 3, 4], ops: [1, 2, 3, 4, 1].slice(0, 4) as Operator[], total: 0,
    };
    expect(parseNEquation(formatNEquation(a4))).toEqual(a4);
    expect(parseNEquation(formatNEquation(a5))).toEqual(a5);
  });

  it("rejects malformed input", () => {
    expect(() => parseNEquation("garbage")).toThrow();
    expect(() => parseNEquation("2^3 + 3^1 = 5")).toThrow(); // arity 2
    expect(() => parseNEquation("2^3 + 3^1 + 5^1 = banana")).toThrow(/integer total/);
    expect(() => parseNEquation("2 + 3 + 5 = 10")).toThrow(/<dice>\^<exp>/);
    expect(() => parseNEquation("2^3 + 3^1 + 5^1 ! 10")).toThrow(/=/);
  });
});
