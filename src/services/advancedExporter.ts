import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  encodeChunk,
  encodeCoverage,
  encodeIndex,
  type Chunk,
  type ChunkRecord,
  type CoverageFile,
  type CoverageRow,
  type IndexFile,
  type IndexRow,
  type Operator as BinaryOperator,
} from "../core/n2kBinary.js";
import type { Arity, Operator as CoreOperator } from "../core/types.js";
import {
  solveOneTuple,
  type AdvBulkSolution,
  type AdvancedSolverOptions,
} from "./advancedSolver.js";

/**
 * Pure-function output of solving one dice tuple, ready for the
 * orchestrator to either write to disk directly or ship across a
 * worker_threads message channel for aggregation.
 *
 * Held as primitives (Uint8Array, plain objects) so it's
 * postMessage-safe with a transferable.
 */
export interface AdvancedTupleResult {
  readonly arity: Arity;
  readonly dice: readonly number[];
  readonly chunkBytes: Uint8Array;
  readonly indexRow: IndexRow;
  /** One entry per solvable target — used to build the coverage aggregate. */
  readonly coverageContribs: ReadonlyArray<{
    readonly target: number;
    readonly difficulty: number;
  }>;
  readonly solvableCount: number;
  readonly impossibleCount: number;
}

// ---------------------------------------------------------------------------
//  Pure transforms
// ---------------------------------------------------------------------------

/** Convert an `AdvBulkSolution` (target order) into binary `ChunkRecord`s. */
export function solutionsToChunkRecords(
  solutions: ReadonlyArray<AdvBulkSolution>,
): ChunkRecord[] {
  return solutions.map((sol) => ({
    target: sol.equation.total,
    difficulty: sol.difficulty,
    exps: sol.equation.exps,
    ops: sol.equation.ops as ReadonlyArray<CoreOperator> as ReadonlyArray<BinaryOperator>,
  }));
}

/** Build the per-tuple summary row for the index file. */
export function summarizeForIndex(
  dice: readonly number[],
  solutions: ReadonlyArray<AdvBulkSolution>,
  totalsCount: number,
): IndexRow {
  if (solutions.length === 0) {
    return {
      dice,
      solvableCount: 0,
      impossibleCount: totalsCount,
      minDifficulty: 0,
      maxDifficulty: 0,
      averageDifficulty: 0,
    };
  }
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  for (const s of solutions) {
    const d = s.difficulty;
    if (d < min) min = d;
    if (d > max) max = d;
    sum += d;
  }
  return {
    dice,
    solvableCount: solutions.length,
    impossibleCount: totalsCount - solutions.length,
    minDifficulty: min,
    maxDifficulty: max,
    averageDifficulty: sum / solutions.length,
  };
}

/**
 * Solve one tuple and serialize it into binary form. Stateless and
 * synchronous so it can run inside a worker_thread.
 */
export function exportTupleAdvanced(
  dice: readonly number[],
  arity: Arity,
  totalMin: number,
  totalMax: number,
  options: AdvancedSolverOptions = {},
): AdvancedTupleResult {
  const totalsCount = totalMax - totalMin + 1;
  const solutions = solveOneTuple(dice, arity, totalMin, totalMax, options);
  const records = solutionsToChunkRecords(solutions);
  const chunk: Chunk = { arity, dice, records };
  const chunkBytes = encodeChunk(chunk);
  const indexRow = summarizeForIndex(dice, solutions, totalsCount);
  const coverageContribs = solutions.map((s) => ({
    target: s.equation.total,
    difficulty: s.difficulty,
  }));
  return {
    arity,
    dice,
    chunkBytes,
    indexRow,
    coverageContribs,
    solvableCount: solutions.length,
    impossibleCount: totalsCount - solutions.length,
  };
}

// ---------------------------------------------------------------------------
//  Aggregation
// ---------------------------------------------------------------------------

/**
 * Streaming aggregator that builds the final per-arity index and
 * coverage files from a sequence of {@link AdvancedTupleResult}s.
 * Designed to absorb worker results in arbitrary completion order.
 */
export class ArityAggregator {
  readonly arity: Arity;
  readonly totalMin: number;
  readonly totalMax: number;
  readonly indexRows: IndexRow[] = [];
  /** target → {min, max, count} */
  private readonly coverage = new Map<
    number,
    { min: number; max: number; count: number }
  >();

  constructor(arity: Arity, totalMin: number, totalMax: number) {
    this.arity = arity;
    this.totalMin = totalMin;
    this.totalMax = totalMax;
  }

  ingest(result: AdvancedTupleResult): void {
    if (result.arity !== this.arity) {
      throw new RangeError(
        `ArityAggregator: arity mismatch (got ${result.arity}, want ${this.arity})`,
      );
    }
    this.indexRows.push(result.indexRow);
    for (const c of result.coverageContribs) {
      const cur = this.coverage.get(c.target);
      if (cur === undefined) {
        this.coverage.set(c.target, { min: c.difficulty, max: c.difficulty, count: 1 });
      } else {
        if (c.difficulty < cur.min) cur.min = c.difficulty;
        if (c.difficulty > cur.max) cur.max = c.difficulty;
        cur.count += 1;
      }
    }
  }

  buildIndexFile(): IndexFile {
    // Stable sort by dice value lex order so the file is reproducible
    // regardless of worker completion order.
    const rows = this.indexRows.slice().sort((a, b) => compareDice(a.dice, b.dice));
    return { arity: this.arity, rows };
  }

  buildCoverageFile(): CoverageFile {
    const rows: CoverageRow[] = [];
    for (let t = this.totalMin; t <= this.totalMax; t += 1) {
      const cur = this.coverage.get(t);
      rows.push({
        target: t,
        minDifficulty: cur === undefined ? null : cur.min,
        maxDifficulty: cur === undefined ? null : cur.max,
        solvableTuples: cur === undefined ? 0 : cur.count,
      });
    }
    // Coverage rows are 1-indexed by target inside the binary file. If
    // totalMin > 1, shift the targets down to 1..N for the encoder; the
    // exporter records the offset in the manifest.
    if (this.totalMin !== 1) {
      const shift = 1 - this.totalMin;
      return {
        arity: this.arity,
        rows: rows.map((r) => ({ ...r, target: r.target + shift })),
      };
    }
    return { arity: this.arity, rows };
  }
}

function compareDice(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]!;
    const y = b[i]!;
    if (x !== y) return x - y;
  }
  return 0;
}

// ---------------------------------------------------------------------------
//  Disk layout
// ---------------------------------------------------------------------------

/** Build the on-disk filename for a chunk file. Negative dice keep their sign. */
export function chunkFilename(dice: readonly number[]): string {
  return `d_${dice.join("_")}.n2k`;
}

/** Path to a chunk file inside `outputDir`. Mirrors `chunks/{arity}/<file>.n2k`. */
export function chunkPath(
  outputDir: string,
  arity: Arity,
  dice: readonly number[],
): string {
  return join(outputDir, "chunks", String(arity), chunkFilename(dice));
}

/** Write one chunk file to disk, creating parent directories as needed. */
export async function writeChunkFile(
  outputDir: string,
  arity: Arity,
  dice: readonly number[],
  bytes: Uint8Array,
): Promise<string> {
  const path = chunkPath(outputDir, arity, dice);
  await mkdir(join(outputDir, "chunks", String(arity)), { recursive: true });
  await writeFile(path, bytes);
  return path;
}

/** Write the per-arity index + coverage files; returns their paths. */
export async function writeArityAggregates(
  outputDir: string,
  arity: Arity,
  index: IndexFile,
  coverage: CoverageFile,
): Promise<{ indexPath: string; coveragePath: string }> {
  await mkdir(outputDir, { recursive: true });
  const indexPath = join(outputDir, `index-${arity}.n2k`);
  const coveragePath = join(outputDir, `coverage-${arity}.n2k`);
  await writeFile(indexPath, encodeIndex(index));
  await writeFile(coveragePath, encodeCoverage(coverage));
  return { indexPath, coveragePath };
}
