import { createWriteStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import type { DiceTriple } from "../core/types.js";
import { formatEquation } from "./parsing.js";
import { solveForAllTargets, type SolverOptions } from "./solver.js";

/** Enumerate every unordered triple `(a, b, c)` with `min <= a <= b <= c <= max`. */
export function enumerateUnorderedTriples(min: number, max: number): DiceTriple[] {
  if (min > max) {
    throw new RangeError(`min (${min}) must be <= max (${max})`);
  }
  const triples: DiceTriple[] = [];
  for (let a = min; a <= max; a += 1) {
    for (let b = a; b <= max; b += 1) {
      for (let c = b; c <= max; c += 1) {
        triples.push([a, b, c]);
      }
    }
  }
  return triples;
}

/** Run-time options for {@link exportAllSolutions}. */
export interface ExportOptions {
  /** Inclusive lower bound for dice values (default 1). */
  readonly diceMin?: number;
  /** Inclusive upper bound for dice values (default 20). */
  readonly diceMax?: number;
  /** Inclusive lower bound for board totals (default 1). */
  readonly totalMin?: number;
  /** Inclusive upper bound for board totals (default 999). */
  readonly totalMax?: number;
  /** Whether to depower compound dice (default false for export). */
  readonly depower?: boolean;
  /**
   * Optional callback invoked after each dice triple finishes. Receives the
   * triple just completed plus a `(done, total)` progress pair so the caller
   * can render a progress bar / log.
   */
  readonly onProgress?: (info: {
    readonly dice: DiceTriple;
    readonly done: number;
    readonly total: number;
    readonly solvableCount: number;
  }) => void;
}

/** One row in the per-dice summary that gets written to the manifest. */
export interface PerDiceSummary {
  readonly dice: DiceTriple;
  readonly solvableCount: number;
  readonly impossibleCount: number;
  readonly minDifficulty: number | null;
  readonly maxDifficulty: number | null;
  readonly averageDifficulty: number | null;
}

/** Top-level metadata describing an export run. */
export interface ExportManifest {
  readonly generatedAt: string;
  readonly diceMin: number;
  readonly diceMax: number;
  readonly diceTriplesTotal: number;
  readonly totalMin: number;
  readonly totalMax: number;
  readonly depower: boolean;
  readonly recordsWritten: number;
  readonly elapsedMs: number;
  readonly perDice: readonly PerDiceSummary[];
}

/** Final summary returned to the CLI after the export completes. */
export interface ExportResult {
  readonly manifest: ExportManifest;
  readonly outputPath: string;
  readonly manifestPath: string;
}

/**
 * Bulk-export the easiest solution for every (dice triple, target) cell in
 * the configured ranges to an NDJSON file, plus a sidecar manifest with
 * per-dice statistics.
 *
 * NDJSON record shape (one per line):
 *
 *   { "dice": [d1,d2,d3], "total": 40, "difficulty": 12.34,
 *     "equation": "2^5 + 2^2 + 2^2 = 40" }
 *
 * Targets with no possible solution are simply omitted (the manifest tracks
 * the impossible counts per dice triple).
 *
 * Streams output line-by-line so memory stays flat regardless of total size.
 */
export async function exportAllSolutions(
  outputPath: string,
  options: ExportOptions = {},
): Promise<ExportResult> {
  const {
    diceMin = 1,
    diceMax = 20,
    totalMin = 1,
    totalMax = 999,
    depower = false,
    onProgress,
  } = options;

  const start = Date.now();

  await mkdir(dirname(outputPath), { recursive: true });

  const triples = enumerateUnorderedTriples(diceMin, diceMax);
  const stream = createWriteStream(outputPath, { encoding: "utf8" });

  let recordsWritten = 0;
  const perDice: PerDiceSummary[] = [];
  const solverOpts: SolverOptions = { depower };

  try {
    for (let i = 0; i < triples.length; i += 1) {
      const dice = triples[i]!;
      const solutions = solveForAllTargets(dice, totalMin, totalMax, solverOpts);

      // Stable order: sort by total ascending so the file is reproducible.
      const sortedTotals = [...solutions.keys()].sort((a, b) => a - b);
      const difficulties: number[] = [];

      for (const total of sortedTotals) {
        const { equation, difficulty } = solutions.get(total)!;
        const record = {
          dice,
          total,
          difficulty,
          equation: formatEquation(equation),
        };
        if (!stream.write(JSON.stringify(record) + "\n")) {
          await new Promise<void>((resolve) => stream.once("drain", resolve));
        }
        difficulties.push(difficulty);
        recordsWritten += 1;
      }

      const summary: PerDiceSummary = summarizeDice(
        dice,
        difficulties,
        totalMax - totalMin + 1,
      );
      perDice.push(summary);

      onProgress?.({
        dice,
        done: i + 1,
        total: triples.length,
        solvableCount: summary.solvableCount,
      });
    }

    await new Promise<void>((resolve, reject) => {
      stream.end((err: NodeJS.ErrnoException | null | undefined) =>
        err ? reject(err) : resolve(),
      );
    });
  } catch (err) {
    stream.destroy();
    throw err;
  }

  const manifest: ExportManifest = {
    generatedAt: new Date(start).toISOString(),
    diceMin,
    diceMax,
    diceTriplesTotal: triples.length,
    totalMin,
    totalMax,
    depower,
    recordsWritten,
    elapsedMs: Date.now() - start,
    perDice,
  };

  const manifestPath = manifestPathFor(outputPath);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  return { manifest, outputPath, manifestPath };
}

function manifestPathFor(outputPath: string): string {
  if (outputPath.endsWith(".ndjson")) {
    return outputPath.replace(/\.ndjson$/, ".manifest.json");
  }
  return `${outputPath}.manifest.json`;
}

function summarizeDice(
  dice: DiceTriple,
  difficulties: readonly number[],
  totalsCount: number,
): PerDiceSummary {
  if (difficulties.length === 0) {
    return {
      dice,
      solvableCount: 0,
      impossibleCount: totalsCount,
      minDifficulty: null,
      maxDifficulty: null,
      averageDifficulty: null,
    };
  }
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  for (const d of difficulties) {
    if (d < min) min = d;
    if (d > max) max = d;
    sum += d;
  }
  return {
    dice,
    solvableCount: difficulties.length,
    impossibleCount: totalsCount - difficulties.length,
    minDifficulty: Math.round(min * 100) / 100,
    maxDifficulty: Math.round(max * 100) / 100,
    averageDifficulty: Math.round((sum / difficulties.length) * 100) / 100,
  };
}
