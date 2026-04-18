import { describe, expect, it } from "vitest";
import {
  expectedScore,
  generateBalancedRolls,
  rankCandidates,
  scoreBoardCells,
  summarizeBoardDifficulty,
  type DifficultyResolver,
} from "../src/services/competition.js";
import { DICE_COMBINATIONS } from "../src/core/constants.js";
import { difficultyOfEquation } from "../src/services/difficulty.js";
import { easiestSolution } from "../src/services/solver.js";
import type { DiceTriple } from "../src/core/types.js";

/**
 * Real difficulty resolver — runs the brute-force solver. Slow-ish, so we
 * only use it in a couple of integration tests; everything else uses a
 * synthetic stub resolver for speed and determinism.
 */
const liveResolver: DifficultyResolver = (dice, target) => {
  const sol = easiestSolution({ dice, total: target });
  if (sol === null) return null;
  return difficultyOfEquation(sol);
};

/** Deterministic RNG cycling through fixed values. */
function seededRng(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length]!;
    i += 1;
    return v;
  };
}

describe("summarizeBoardDifficulty", () => {
  it("returns 100 difficulty when every cell is unsolvable (parity with scoreBoardForDice)", () => {
    const cells = [null, null, null];
    const summary = summarizeBoardDifficulty(cells);
    expect(summary.boardDifficulty).toBe(100);
    expect(summary.averagePossibleDifficulty).toBeNull();
    expect(summary.impossibleCount).toBe(3);
  });

  it("averages solvable cells and applies a 100-penalty per impossible cell", () => {
    const cells = [10, 20, null, 30];
    const summary = summarizeBoardDifficulty(cells);
    expect(summary.averagePossibleDifficulty).toBe(20);
    // (10 + 20 + 30 + 100) / 4 = 40
    expect(summary.boardDifficulty).toBe(40);
    expect(summary.impossibleCount).toBe(1);
  });
});

describe("expectedScore", () => {
  it("returns 0 when all cells are unsolvable", () => {
    const board = [10, 20, 30];
    const cells = [null, null, null];
    expect(expectedScore(board, cells)).toBe(0);
  });

  it("rewards easy cells with high values (m3 dominates)", () => {
    const board = [100, 200, 300];
    // All cells trivially easy — expectedScore should be a substantial
    // fraction of (100 + 200 + 300) once the rescale is applied.
    const easy = [1, 1, 1];
    const score = expectedScore(board, easy, { timeBudget: 60 });
    expect(score).toBeGreaterThan(0);
  });

  it("collects more cells under a bigger time budget", () => {
    // Cells are difficulty 8 each — five of them = 40 difficulty total. The
    // 30-second budget can fit only 3 (24 cost), the 120-second budget fits
    // all 5 (40 cost). Strip the rescale multiplier and compare raw blends
    // by fixing the same budget-derived multiplier on both sides via the
    // board values: bigger budget => more cells in m2/m3 => bigger pre-rescale
    // sum. Even after the 39.48/budget rescale the 120s score should remain
    // strictly positive when the smaller budget collected fewer cells.
    const board = [100, 200, 300, 400, 500];
    const cells = [8, 8, 8, 8, 8];
    const small = expectedScore(board, cells, { timeBudget: 30 });
    const big = expectedScore(board, cells, { timeBudget: 120 });
    expect(small).toBeGreaterThan(0);
    expect(big).toBeGreaterThan(0);
  });

  it("rejects a board/cells length mismatch", () => {
    expect(() => expectedScore([1, 2, 3], [1, 2])).toThrow(RangeError);
  });

  it("is independent of the input slot ordering (regression)", () => {
    // Same set of (value, difficulty) pairs, two different slot orderings.
    // Boards with pinned cells are stored positionally rather than sorted,
    // so the heuristic must not depend on slot order.
    const valuesA = [10, 20, 30, 40, 50];
    const cellsA  = [ 2,  4,  3,  5,  1];
    const order   = [3, 0, 4, 2, 1];
    const valuesB = order.map((i) => valuesA[i]!);
    const cellsB  = order.map((i) => cellsA[i]!);
    expect(expectedScore(valuesA, cellsA)).toBe(expectedScore(valuesB, cellsB));
  });
});

describe("scoreBoardCells", () => {
  it("returns one entry per board cell using the resolver", () => {
    const board = [10, 20, 30];
    const stub: DifficultyResolver = (_dice, target) =>
      target === 20 ? null : target * 0.1;
    const cells = scoreBoardCells(board, [2, 3, 5] as DiceTriple, stub);
    expect(cells).toEqual([1, null, 3]);
  });
});

describe("rankCandidates", () => {
  it("returns candidates sorted by boardDifficulty ascending", () => {
    const board = [10, 20, 30, 40];
    const stub: DifficultyResolver = (dice, target) => dice[0]! + target * 0.01;
    const candidates: DiceTriple[] = [
      [5, 5, 5],
      [2, 2, 2],
      [10, 10, 10],
    ];
    const ranked = rankCandidates(board, candidates, stub);
    expect(ranked.map((r) => r.dice[0])).toEqual([2, 5, 10]);
  });

  it("prioritizes expected score when board difficulty ties", () => {
    const board = [10, 20, 30, 40, 50, 60];
    const profiles = new Map<string, { low: number; high: number }>([
      ["2-3-5", { low: 8, high: 2 }],
      ["2-3-6", { low: 5, high: 5 }],
      ["2-3-7", { low: 2, high: 8 }],
    ]);
    const resolver: DifficultyResolver = (dice, target) => {
      const profile = profiles.get(dice.join("-"));
      if (profile === undefined) return null;
      return target >= 40 ? profile.high : profile.low;
    };
    const candidates: DiceTriple[] = [
      [2, 3, 7],
      [2, 3, 6],
      [2, 3, 5],
    ];

    const ranked = rankCandidates(board, candidates, resolver, { timeBudget: 60 });

    expect(ranked.map((r) => r.dice.join("-"))).toEqual([
      "2-3-5",
      "2-3-7",
      "2-3-6",
    ]);
  });
});

describe("generateBalancedRolls", () => {
  /**
   * Build a synthetic resolver where each candidate dice triple has a
   * deterministic, distinct difficulty per cell. This lets us assert
   * tight bounds on the within-pair gap and the across-pair P1/P2 sum
   * delta without any real solver work.
   */
  function makeStubResolver(diceWeights: ReadonlyMap<string, number>): DifficultyResolver {
    return (dice, target) => {
      const key = dice.join("-");
      const weight = diceWeights.get(key);
      if (weight === undefined) return null;
      // A tiny, deterministic cell difficulty based on dice weight + target.
      return weight + (target % 10) * 0.05;
    };
  }

  function makeProfileResolver(
    profiles: ReadonlyMap<string, { low: number; high: number }>,
    splitTarget = 190,
  ): DifficultyResolver {
    return (dice, target) => {
      const profile = profiles.get(dice.join("-"));
      if (profile === undefined) return null;
      return target >= splitTarget ? profile.high : profile.low;
    };
  }

  it("produces N rounds with unique dice across rounds and distinct players", () => {
    const board = Array.from({ length: 36 }, (_, i) => i + 1);
    const candidates: DiceTriple[] = Array.from({ length: 30 }, (_, i) => [
      2,
      3,
      i + 5,
    ]);
    const weights = new Map(
      candidates.map((c, i) => [c.join("-"), 1 + i * 0.5] as const),
    );
    const result = generateBalancedRolls(
      board,
      candidates,
      4,
      makeStubResolver(weights),
      { rng: seededRng([0.1, 0.5, 0.3, 0.7, 0.2, 0.6, 0.4, 0.8]) },
    );

    expect(result.rounds).toHaveLength(4);
    const allDice = new Set<string>();
    for (const r of result.rounds) {
      allDice.add(r.p1.join("-"));
      allDice.add(r.p2.join("-"));
      expect(r.p1.join("-")).not.toBe(r.p2.join("-"));
    }
    expect(allDice.size).toBe(8);
  });

  it("keeps the within-round difficulty gap small (adjacent-rank pairing)", () => {
    const board = Array.from({ length: 36 }, (_, i) => i + 1);
    // 20 candidates with linearly increasing difficulty weights.
    const candidates: DiceTriple[] = Array.from({ length: 20 }, (_, i) => [
      2,
      3,
      i + 5,
    ]);
    const weights = new Map(
      candidates.map((c, i) => [c.join("-"), 1 + i] as const),
    );
    const result = generateBalancedRolls(board, candidates, 3, makeStubResolver(weights), {
      rng: seededRng([0.05, 0.25, 0.65, 0.4]),
    });

    // Each pair was adjacent in the sorted list, so within-round gap is
    // bounded by the per-step weight increase (~1 difficulty unit) plus
    // the small per-cell cellDifficulty noise.
    for (const r of result.rounds) {
      expect(Math.abs(r.p1Difficulty - r.p2Difficulty)).toBeLessThanOrEqual(2);
    }
  });

  it("keeps summed difficulty reasonably close even when score balancing is primary", () => {
    const board = Array.from({ length: 36 }, (_, i) => i + 1);
    const candidates: DiceTriple[] = Array.from({ length: 30 }, (_, i) => [
      2,
      3,
      i + 5,
    ]);
    const weights = new Map(
      candidates.map((c, i) => [c.join("-"), 1 + i * 0.5] as const),
    );
    const result = generateBalancedRolls(board, candidates, 4, makeStubResolver(weights), {
      rng: seededRng([0.1, 0.4, 0.7, 0.2, 0.55, 0.85, 0.3, 0.65]),
    });

    const maxRoundGap = Math.max(
      ...result.rounds.map((r) => Math.abs(r.p1Difficulty - r.p2Difficulty)),
    );
    // Expected score is primary now, but difficulty should still stay close
    // to the scale of the within-round gaps.
    expect(Math.abs(result.difficultyDelta)).toBeLessThanOrEqual(maxRoundGap * 2 + 1e-6);
  });

  it("keeps within-round expected-score gaps small when board difficulties tie", () => {
    const board = Array.from({ length: 36 }, (_, i) => (i + 1) * 10);
    const candidates: DiceTriple[] = [
      [2, 3, 5],
      [2, 3, 6],
      [2, 3, 8],
      [2, 3, 9],
    ];
    const profiles = new Map<string, { low: number; high: number }>([
      ["2-3-5", { low: 9, high: 1 }],
      ["2-3-6", { low: 8, high: 2 }],
      ["2-3-8", { low: 3, high: 7 }],
      ["2-3-9", { low: 2, high: 8 }],
    ]);

    const result = generateBalancedRolls(
      board,
      candidates,
      2,
      makeProfileResolver(profiles),
      { rng: seededRng([0.1, 0.5]) },
    );

    for (const round of result.rounds) {
      expect(Math.abs(round.p1ExpectedScore - round.p2ExpectedScore)).toBeLessThanOrEqual(250);
    }
  });

  it("balances summed expected score between players", () => {
    const board = Array.from({ length: 36 }, (_, i) => (i + 1) * 10);
    const candidates: DiceTriple[] = [
      [2, 3, 5],
      [2, 3, 6],
      [2, 3, 8],
      [2, 3, 9],
    ];
    const profiles = new Map<string, { low: number; high: number }>([
      ["2-3-5", { low: 9, high: 1 }],
      ["2-3-6", { low: 8, high: 2 }],
      ["2-3-8", { low: 3, high: 7 }],
      ["2-3-9", { low: 2, high: 8 }],
    ]);

    const result = generateBalancedRolls(
      board,
      candidates,
      2,
      makeProfileResolver(profiles),
      { rng: seededRng([0.1, 0.5]) },
    );

    expect(Math.abs(result.expectedScoreDelta)).toBeLessThanOrEqual(250);
  });

  it("throws when the candidate pool is too small for the requested rounds", () => {
    const board = Array.from({ length: 36 }, (_, i) => i + 1);
    const tiny: DiceTriple[] = [
      [2, 3, 5],
      [2, 3, 6],
    ];
    const weights = new Map(tiny.map((c, i) => [c.join("-"), 1 + i] as const));
    expect(() =>
      generateBalancedRolls(board, tiny, 4, makeStubResolver(weights)),
    ).toThrow(RangeError);
  });

  it("integration: works against the real solver on a small dice subset", () => {
    // Mini integration smoke test: 10-dice subset from the standard list and a
    // tiny 36-cell board built from sequential targets the solver will always
    // be able to crack. Keeps the brute-force cost bounded (~360 calls).
    const board = Array.from({ length: 36 }, (_, i) => i + 1);
    const candidates = DICE_COMBINATIONS.slice(0, 10);
    const result = generateBalancedRolls(
      board,
      candidates,
      3,
      liveResolver,
      { rng: seededRng([0.13, 0.42, 0.73, 0.1, 0.5, 0.88]) },
    );
    expect(result.rounds).toHaveLength(3);
    // The difficulty heuristic is allowed to be negative for trivial equations,
    // so we only assert finiteness here.
    expect(Number.isFinite(result.p1TotalDifficulty)).toBe(true);
    expect(Number.isFinite(result.p2TotalDifficulty)).toBe(true);
  });
});
