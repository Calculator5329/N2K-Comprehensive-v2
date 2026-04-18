import { BOARD, DIFFICULTY_BUCKETS } from "../core/constants.js";
import type { DiceTriple } from "../core/types.js";
import { difficultyOfEquation } from "./difficulty.js";
import { easiestSolution } from "./solver.js";

/** Per-cell difficulty result. `null` indicates the cell is unsolvable. */
export type CellDifficulty = number | null;

/** Aggregated difficulty info for a single dice triple against a board. */
export interface DiceBoardResult {
  readonly dice: DiceTriple;
  readonly cellDifficulties: readonly CellDifficulty[];
  readonly impossibleCount: number;
  /** Average difficulty among solvable cells; `null` if every cell is unsolvable. */
  readonly averagePossibleDifficulty: number | null;
  /**
   * Composite "board difficulty": weighted average where unsolvable cells
   * contribute the maximum penalty. Always in [0, 100].
   */
  readonly boardDifficulty: number;
}

function average(nums: readonly number[]): number | null {
  if (nums.length === 0) return null;
  const sum = nums.reduce((acc, n) => acc + n, 0);
  return sum / nums.length;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Score one board against one dice triple. */
export function scoreBoardForDice(
  dice: DiceTriple,
  board: readonly number[],
): DiceBoardResult {
  const cellDifficulties: CellDifficulty[] = [];
  const possible: number[] = [];

  for (const target of board) {
    const solution = easiestSolution({ dice, total: target });
    if (solution === null) {
      cellDifficulties.push(null);
    } else {
      const score = difficultyOfEquation(solution);
      cellDifficulties.push(score);
      possible.push(score);
    }
  }

  const impossibleCount = board.length - possible.length;
  const avg = average(possible);

  // FIX: original Python crashed with ZeroDivisionError when the dice could
  // not solve any cell. We treat "all impossible" as max difficulty (100).
  const boardDifficulty =
    avg === null
      ? 100
      : ((avg * possible.length) + 100 * impossibleCount) / board.length;

  return {
    dice,
    cellDifficulties,
    impossibleCount,
    averagePossibleDifficulty: avg === null ? null : round2(avg),
    boardDifficulty: round2(boardDifficulty),
  };
}

/** Bucketed summary of dice triples by overall board difficulty. */
export type DifficultyBuckets = ReadonlyArray<{
  readonly range: readonly [number, number];
  readonly entries: ReadonlyArray<{ readonly dice: DiceTriple; readonly difficulty: number }>;
}>;

/** Group results into the standard difficulty buckets used by the report. */
export function bucketResults(results: readonly DiceBoardResult[]): DifficultyBuckets {
  const lastIndex = DIFFICULTY_BUCKETS.length - 1;
  return DIFFICULTY_BUCKETS.map(([lo, hi], i) => {
    // The final bucket is closed on the right so a fully-impossible board
    // (boardDifficulty === 100) is reported instead of silently dropped.
    const isLast = i === lastIndex;
    return {
      range: [lo, hi] as const,
      entries: results
        .filter((r) =>
          r.boardDifficulty >= lo && (isLast ? r.boardDifficulty <= hi : r.boardDifficulty < hi),
        )
        .map((r) => ({ dice: r.dice, difficulty: r.boardDifficulty })),
    };
  });
}

/** Validate that a list of board numbers is a complete N2K board. */
export function assertValidBoard(board: readonly number[]): void {
  if (board.length !== BOARD.size) {
    throw new RangeError(
      `Board must contain exactly ${BOARD.size} numbers (got ${board.length})`,
    );
  }
}
