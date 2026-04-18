import { describe, expect, it } from "vitest";
import {
  generateBoard,
  generatePatternBoard,
  generateRandomBoard,
  generateRandomDice,
} from "../src/services/generators.js";

/**
 * Deterministic pseudo-RNG for tests. Cycles through a fixed sequence so
 * `generateRandomBoard` / `generateRandomDice` produce predictable output
 * without depending on `Math.random`.
 */
function seededRng(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length]!;
    i += 1;
    return v;
  };
}

describe("generateRandomBoard", () => {
  it("returns 36 unique sorted values within range", () => {
    const board = generateRandomBoard(999);
    expect(board).toHaveLength(36);
    expect(new Set(board).size).toBe(36);
    expect([...board].sort((a, b) => a - b)).toEqual(board);
    expect(Math.min(...board)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...board)).toBeLessThanOrEqual(999);
  });

  it("throws when range is too small to fit 36 unique values", () => {
    expect(() => generateRandomBoard(10)).toThrow(RangeError);
  });

  it("supports a {min, max} range object", () => {
    const board = generateRandomBoard({ min: 100, max: 200 });
    expect(board).toHaveLength(36);
    expect(Math.min(...board)).toBeGreaterThanOrEqual(100);
    expect(Math.max(...board)).toBeLessThanOrEqual(200);
  });

  it("throws when {min, max} cannot fit 36 unique values", () => {
    expect(() => generateRandomBoard({ min: 1, max: 30 })).toThrow(RangeError);
    expect(() => generateRandomBoard({ min: 50, max: 10 })).toThrow(RangeError);
  });
});

describe("generatePatternBoard", () => {
  it("emits a length-36 arithmetic progression for a single multiple", () => {
    const board = generatePatternBoard([6], 6);
    expect(board).toHaveLength(36);
    expect(board[0]).toBe(6);
    expect(board[1]).toBe(12);
    expect(board[35]).toBe(6 + 35 * 6);
  });

  it("emits paired progressions for two multiples", () => {
    const board = generatePatternBoard([2, 3], 0);
    expect(board).toHaveLength(36);
    expect(board[0]).toBe(0);
    expect(board[1]).toBe(2);
    // Next pair offset by stepA + stepB = 5.
    expect(board[2]).toBe(5);
    expect(board[3]).toBe(7);
  });

  it("emits triple progressions for three multiples", () => {
    // start=0, [a=2, b=3, c=5] → group advance = 10.
    // First group: 0, 2, 5. Second group: 10, 12, 15. ...
    const board = generatePatternBoard([2, 3, 5], 0);
    expect(board).toHaveLength(36);
    expect(board.slice(0, 3)).toEqual([0, 2, 5]);
    expect(board.slice(3, 6)).toEqual([10, 12, 15]);
  });

  it("auto-shifts the start to keep three-multiple boards non-negative", () => {
    // Negative middle multiple — Python original adjusts startingNumber up
    // by the most-negative sum so no cell goes below 0.
    const board = generatePatternBoard([4, -2, 3], 0);
    expect(Math.min(...board)).toBeGreaterThanOrEqual(0);
  });

  it("rejects empty or >3 multiples (regression: Python returned [])", () => {
    expect(() => generatePatternBoard([])).toThrow(RangeError);
    expect(() => generatePatternBoard([1, 2, 3, 4])).toThrow(RangeError);
  });
});

describe("generateRandomDice", () => {
  it("never returns three identical values", () => {
    // Force the RNG to first roll [5,5,5], then [5,5,1].
    const rng = seededRng([
      // First triple: all 5s (must be rerolled).
      0.4, 0.4, 0.4,
      // Second triple: 5, 5, 1.
      0.4, 0.4, 0.0,
    ]);
    const dice = generateRandomDice({ minDice: 1, maxDice: 10, lastMaxDice: 20 }, rng);
    expect(new Set(dice).size).toBeGreaterThan(1);
  });

  it("respects the configured ranges", () => {
    const dice = generateRandomDice({ minDice: 2, maxDice: 6, lastMaxDice: 12 });
    expect(dice[0]).toBeGreaterThanOrEqual(2);
    expect(dice[0]).toBeLessThanOrEqual(6);
    expect(dice[1]).toBeGreaterThanOrEqual(2);
    expect(dice[1]).toBeLessThanOrEqual(6);
    expect(dice[2]).toBeGreaterThanOrEqual(2);
    expect(dice[2]).toBeLessThanOrEqual(12);
  });
});

describe("generateBoard (BoardSpec)", () => {
  it("dispatches to the random generator and returns 36 sorted values", () => {
    const board = generateBoard({ kind: "random", range: { min: 1, max: 999 } });
    expect(board).toHaveLength(36);
    expect([...board].sort((a, b) => a - b)).toEqual(board);
    expect(new Set(board).size).toBe(36);
  });

  it("dispatches to the pattern generator with three multiples", () => {
    const board = generateBoard({
      kind: "pattern",
      multiples: [2, 3, 5],
      start: 0,
    });
    expect(board).toHaveLength(36);
    // Sorted form of triples starting at 0: [0, 2, 5, 10, 12, 15, 20, ...]
    expect(board.slice(0, 3)).toEqual([0, 2, 5]);
  });

  it("pins random-board overrides at their exact slot indices (not sorted)", () => {
    const board = generateBoard({
      kind: "random",
      range: { min: 1, max: 999 },
      overrides: [
        { slot: 0, value: 7 },
        { slot: 35, value: 777 },
      ],
    });
    expect(board).toHaveLength(36);
    expect(board[0]).toBe(7);
    expect(board[35]).toBe(777);
    expect(new Set(board).size).toBe(36);
  });

  it("does not double-emit pinned values elsewhere in the board (regression)", () => {
    // Regression: the previous implementation re-sorted the merged board, so
    // a pinned 200 would appear both at the pinned slot AND at its sorted
    // rank — the UI then rendered "200" twice and effectively lost a cell.
    const board = generateBoard({
      kind: "random",
      range: { min: 1, max: 999 },
      overrides: [
        { slot: 0, value: 200 },
        { slot: 6, value: 250 },
        { slot: 12, value: 300 },
      ],
    });
    expect(board[0]).toBe(200);
    expect(board[6]).toBe(250);
    expect(board[12]).toBe(300);
    expect(board.filter((v) => v === 200)).toHaveLength(1);
    expect(board.filter((v) => v === 250)).toHaveLength(1);
    expect(board.filter((v) => v === 300)).toHaveLength(1);
  });

  it("pins pattern-board overrides at their slot indices, leaves others in pattern order", () => {
    const board = generateBoard({
      kind: "pattern",
      multiples: [10],
      start: 10,
      overrides: [{ slot: 0, value: 5 }],
    });
    expect(board[0]).toBe(5);
    // The remaining slots keep the natural pattern values (20, 30, ...).
    expect(board[1]).toBe(20);
    expect(board[2]).toBe(30);
    expect(board.filter((v) => v === 10)).toHaveLength(0);
  });

  it("returns a sorted board when no overrides are supplied (back-compat)", () => {
    const board = generateBoard({
      kind: "random",
      range: { min: 1, max: 999 },
    });
    expect([...board].sort((a, b) => a - b)).toEqual(board);
  });

  it("rejects duplicate override slots or values", () => {
    expect(() =>
      generateBoard({
        kind: "random",
        range: { min: 1, max: 999 },
        overrides: [
          { slot: 0, value: 7 },
          { slot: 0, value: 8 },
        ],
      }),
    ).toThrow(RangeError);

    expect(() =>
      generateBoard({
        kind: "random",
        range: { min: 1, max: 999 },
        overrides: [
          { slot: 0, value: 7 },
          { slot: 1, value: 7 },
        ],
      }),
    ).toThrow(RangeError);
  });

  it("rejects out-of-range override slots", () => {
    expect(() =>
      generateBoard({
        kind: "random",
        range: { min: 1, max: 999 },
        overrides: [{ slot: 36, value: 7 }],
      }),
    ).toThrow(RangeError);
  });
});
