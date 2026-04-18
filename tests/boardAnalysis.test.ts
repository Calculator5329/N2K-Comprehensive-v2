import { describe, expect, it } from "vitest";
import {
  bucketResults,
  scoreBoardForDice,
} from "../src/services/boardAnalysis.js";

describe("scoreBoardForDice", () => {
  it("returns 100 difficulty when no cells are solvable (regression: Python /0)", () => {
    // A 6-cell mini-board of unreachable totals.
    const board = [9_999_999, 9_999_998, 9_999_997, 9_999_996, 9_999_995, 9_999_994];
    const result = scoreBoardForDice([2, 2, 2], board);
    expect(result.impossibleCount).toBe(board.length);
    expect(result.averagePossibleDifficulty).toBeNull();
    expect(result.boardDifficulty).toBe(100);
  });

  it("computes a per-cell difficulty list of the correct shape", () => {
    const board = [4, 8, 16, 32, 64, 128];
    const result = scoreBoardForDice([2, 2, 2], board);
    expect(result.cellDifficulties).toHaveLength(board.length);
  });
});

describe("bucketResults", () => {
  it("partitions results into the standard difficulty buckets", () => {
    const buckets = bucketResults([
      { dice: [2, 2, 2], cellDifficulties: [], impossibleCount: 0, averagePossibleDifficulty: 5,  boardDifficulty: 5 },
      { dice: [3, 3, 3], cellDifficulties: [], impossibleCount: 0, averagePossibleDifficulty: 25, boardDifficulty: 25 },
      { dice: [5, 5, 5], cellDifficulties: [], impossibleCount: 0, averagePossibleDifficulty: 95, boardDifficulty: 95 },
    ]);
    const ranges = buckets.map((b) => [b.range[0], b.range[1], b.entries.length]);
    expect(ranges).toContainEqual([0, 10, 1]);
    expect(ranges).toContainEqual([20, 30, 1]);
    expect(ranges).toContainEqual([80, 100, 1]);
  });

  it("includes a fully-impossible board (boardDifficulty === 100) in the final bucket", () => {
    // Regression: the old half-open final bucket dropped 100s on the floor,
    // hiding the very triples a player most needs to see.
    const buckets = bucketResults([
      { dice: [2, 2, 2], cellDifficulties: [], impossibleCount: 36, averagePossibleDifficulty: null, boardDifficulty: 100 },
    ]);
    const finalBucket = buckets[buckets.length - 1]!;
    expect(finalBucket.range).toEqual([80, 100]);
    expect(finalBucket.entries).toHaveLength(1);
    expect(finalBucket.entries[0]!.difficulty).toBe(100);
  });

  it("does not double-count a triple on an interior bucket boundary", () => {
    // A boardDifficulty of exactly 30 belongs to [30, 40), not [20, 30].
    const buckets = bucketResults([
      { dice: [2, 2, 2], cellDifficulties: [], impossibleCount: 0, averagePossibleDifficulty: 30, boardDifficulty: 30 },
    ]);
    const totalEntries = buckets.reduce((acc, b) => acc + b.entries.length, 0);
    expect(totalEntries).toBe(1);
    const occupied = buckets.find((b) => b.entries.length > 0)!;
    expect(occupied.range).toEqual([30, 40]);
  });
});
