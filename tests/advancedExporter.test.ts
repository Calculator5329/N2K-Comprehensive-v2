import { describe, expect, it } from "vitest";
import {
  ArityAggregator,
  chunkFilename,
  exportTupleAdvanced,
  solutionsToChunkRecords,
  summarizeForIndex,
} from "../src/services/advancedExporter.js";
import { parseChunk } from "../src/core/n2kBinary.js";
import type { AdvBulkSolution } from "../src/services/advancedSolver.js";
import type { NEquation, Operator } from "../src/core/types.js";

const stubEq = (total: number, exps: number[], ops: Operator[]): NEquation => ({
  dice: [2, 3, 5],
  exps,
  ops,
  total,
});

describe("solutionsToChunkRecords", () => {
  it("preserves target, exps, ops and casts difficulty", () => {
    const sols: AdvBulkSolution[] = [
      { equation: stubEq(7, [1, 1, 0], [1, 1] as Operator[]), difficulty: 12.34 },
      { equation: stubEq(15, [3, 1, 1], [1, 1] as Operator[]), difficulty: 80 },
    ];
    const recs = solutionsToChunkRecords(sols);
    expect(recs).toEqual([
      { target: 7, difficulty: 12.34, exps: [1, 1, 0], ops: [1, 1] },
      { target: 15, difficulty: 80, exps: [3, 1, 1], ops: [1, 1] },
    ]);
  });
});

describe("summarizeForIndex", () => {
  it("returns zeroed row when no solutions exist", () => {
    const row = summarizeForIndex([1, 1, 1], [], 100);
    expect(row).toEqual({
      dice: [1, 1, 1],
      solvableCount: 0,
      impossibleCount: 100,
      minDifficulty: 0,
      maxDifficulty: 0,
      averageDifficulty: 0,
    });
  });

  it("computes min/max/avg difficulty across solutions", () => {
    const sols: AdvBulkSolution[] = [
      { equation: stubEq(1, [0, 0, 0], [1, 1] as Operator[]), difficulty: 1 },
      { equation: stubEq(2, [1, 0, 0], [1, 1] as Operator[]), difficulty: 5 },
      { equation: stubEq(3, [1, 1, 0], [1, 1] as Operator[]), difficulty: 9 },
    ];
    const row = summarizeForIndex([2, 3, 5], sols, 100);
    expect(row.solvableCount).toBe(3);
    expect(row.impossibleCount).toBe(97);
    expect(row.minDifficulty).toBe(1);
    expect(row.maxDifficulty).toBe(9);
    expect(row.averageDifficulty).toBeCloseTo(5);
  });
});

describe("exportTupleAdvanced", () => {
  it("produces parseable chunk bytes for a known tuple", () => {
    const result = exportTupleAdvanced([2, 3, 5], 3, 1, 100);
    expect(result.arity).toBe(3);
    expect(result.dice).toEqual([2, 3, 5]);
    expect(result.solvableCount).toBeGreaterThan(0);
    expect(result.solvableCount + result.impossibleCount).toBe(100);

    // Round-trip the chunk: parse and check structure.
    const buf = result.chunkBytes.buffer.slice(
      result.chunkBytes.byteOffset,
      result.chunkBytes.byteOffset + result.chunkBytes.byteLength,
    );
    const decoded = parseChunk(buf);
    expect(decoded.arity).toBe(3);
    expect(decoded.dice).toEqual([2, 3, 5]);
    expect(decoded.records.length).toBe(result.solvableCount);
    // First record's target matches the smallest reachable target.
    expect(decoded.records[0]!.target).toBeGreaterThan(0);
  });
});

describe("ArityAggregator", () => {
  it("merges per-tuple coverage contribs by target", () => {
    const agg = new ArityAggregator(3, 1, 5);
    agg.ingest({
      arity: 3, dice: [2, 3, 5],
      chunkBytes: new Uint8Array(0),
      indexRow: { dice: [2, 3, 5], solvableCount: 2, impossibleCount: 3, minDifficulty: 1, maxDifficulty: 5, averageDifficulty: 3 },
      coverageContribs: [
        { target: 1, difficulty: 5 },
        { target: 3, difficulty: 9 },
      ],
      solvableCount: 2, impossibleCount: 3,
    });
    agg.ingest({
      arity: 3, dice: [2, 2, 2],
      chunkBytes: new Uint8Array(0),
      indexRow: { dice: [2, 2, 2], solvableCount: 1, impossibleCount: 4, minDifficulty: 2, maxDifficulty: 2, averageDifficulty: 2 },
      coverageContribs: [{ target: 1, difficulty: 2 }],
      solvableCount: 1, impossibleCount: 4,
    });

    const cov = agg.buildCoverageFile();
    expect(cov.arity).toBe(3);
    expect(cov.rows).toHaveLength(5);
    expect(cov.rows[0]).toEqual({ target: 1, minDifficulty: 2, maxDifficulty: 5, solvableTuples: 2 });
    expect(cov.rows[1]).toEqual({ target: 2, minDifficulty: null, maxDifficulty: null, solvableTuples: 0 });
    expect(cov.rows[2]).toEqual({ target: 3, minDifficulty: 9, maxDifficulty: 9, solvableTuples: 1 });
  });

  it("rejects ingesting tuples of a different arity", () => {
    const agg = new ArityAggregator(4, 1, 10);
    expect(() =>
      agg.ingest({
        arity: 3, dice: [1, 2, 3],
        chunkBytes: new Uint8Array(0),
        indexRow: { dice: [1, 2, 3], solvableCount: 0, impossibleCount: 10, minDifficulty: 0, maxDifficulty: 0, averageDifficulty: 0 },
        coverageContribs: [],
        solvableCount: 0, impossibleCount: 10,
      }),
    ).toThrow(/arity mismatch/);
  });

  it("sorts indexRows by dice lex order regardless of ingestion order", () => {
    const agg = new ArityAggregator(3, 1, 5);
    const mkRow = (dice: number[]) => ({
      arity: 3 as const, dice,
      chunkBytes: new Uint8Array(0),
      indexRow: { dice, solvableCount: 1, impossibleCount: 4, minDifficulty: 1, maxDifficulty: 1, averageDifficulty: 1 },
      coverageContribs: [],
      solvableCount: 1, impossibleCount: 4,
    });
    agg.ingest(mkRow([5, 5, 5]));
    agg.ingest(mkRow([1, 2, 3]));
    agg.ingest(mkRow([3, 3, 3]));
    const idx = agg.buildIndexFile();
    expect(idx.rows.map((r) => r.dice)).toEqual([
      [1, 2, 3], [3, 3, 3], [5, 5, 5],
    ]);
  });
});

describe("chunkFilename", () => {
  it("formats positive dice tuples", () => {
    expect(chunkFilename([2, 3, 5])).toBe("d_2_3_5.n2k");
  });
  it("preserves negative dice signs", () => {
    expect(chunkFilename([-3, 0, 7])).toBe("d_-3_0_7.n2k");
  });
  it("supports arity 4 and 5", () => {
    expect(chunkFilename([1, 2, 3, 4])).toBe("d_1_2_3_4.n2k");
    expect(chunkFilename([1, 2, 3, 4, 5])).toBe("d_1_2_3_4_5.n2k");
  });
});
