/**
 * Competition generator — pure algorithms for building "balanced" dice rolls
 * across N rounds for two players on a given board.
 *
 * This module is layer-pure: it imports nothing from `cli/`, performs no I/O,
 * and accepts an injectable `DifficultyResolver` so it can be driven from
 *
 *   - the Node solver (resolver = `easiestSolution(...).difficulty`), and
 *   - the static web dataset (resolver = lookup in the per-dice JSON chunks).
 *
 * Conventions:
 *   - "boardDifficulty" follows the same definition as
 *     `boardAnalysis.ts::scoreBoardForDice`: average per-cell difficulty,
 *     where each unsolvable cell contributes the maximum penalty (100).
 *   - "expectedScore" mirrors the original Python `expected_score` heuristic
 *     with a configurable per-board time budget (default 60).
 *   - Pairing strategy: keep only the easier half of the candidate pool by
 *     `boardDifficulty`, then build adjacent-rank pairs after sorting that
 *     easy pool by `expectedScore` descending.
 */
import { BOARD } from "../core/constants.js";
import type { DiceTriple } from "../core/types.js";

/**
 * Look up the difficulty of the easiest equation that uses `dice` to hit
 * `target`, or `null` if no such equation exists.
 */
export type DifficultyResolver = (
  dice: DiceTriple,
  target: number,
) => number | null;

/** Maximum penalty applied to unsolvable cells. Matches `scoreBoardForDice`. */
export const UNSOLVABLE_PENALTY = 100;

// ---------------------------------------------------------------------------
//  Per-cell scoring
// ---------------------------------------------------------------------------

/** Per-cell difficulty across a board. `null` means the cell is unsolvable. */
export type CellDifficulties = readonly (number | null)[];

/** Score every cell of `board` against `dice` using the given resolver. */
export function scoreBoardCells(
  board: readonly number[],
  dice: DiceTriple,
  resolver: DifficultyResolver,
): CellDifficulties {
  return board.map((target) => resolver(dice, target));
}

/** Aggregated board difficulty (mirror of `boardAnalysis.scoreBoardForDice`). */
export interface BoardDifficultySummary {
  /** Average difficulty across solvable cells. `null` if every cell is unsolvable. */
  readonly averagePossibleDifficulty: number | null;
  /** Composite, in `[0, UNSOLVABLE_PENALTY]`. Lower = easier. */
  readonly boardDifficulty: number;
  readonly impossibleCount: number;
}

export function summarizeBoardDifficulty(
  cells: CellDifficulties,
): BoardDifficultySummary {
  const possible: number[] = [];
  for (const c of cells) if (c !== null) possible.push(c);

  const impossibleCount = cells.length - possible.length;
  if (possible.length === 0) {
    return {
      averagePossibleDifficulty: null,
      boardDifficulty: UNSOLVABLE_PENALTY,
      impossibleCount,
    };
  }

  const avg = possible.reduce((a, b) => a + b, 0) / possible.length;
  const composite =
    cells.length === 0
      ? UNSOLVABLE_PENALTY
      : (avg * possible.length + UNSOLVABLE_PENALTY * impossibleCount) /
        cells.length;

  return {
    averagePossibleDifficulty: round2(avg),
    boardDifficulty: round2(composite),
    impossibleCount,
  };
}

// ---------------------------------------------------------------------------
//  Expected score (port of Python `expected_score`)
// ---------------------------------------------------------------------------

export interface ExpectedScoreOptions {
  /**
   * Per-board time budget in seconds. The expected-score heuristic uses this
   * as the "30-second timer" (Python default). The web UI offers presets
   * 30 / 60 / 120; default here is 60 to match the project default.
   */
  readonly timeBudget?: number;
  /**
   * Difficulty above which a cell is treated as "too hard to attempt within
   * any sensible budget". Matches the Python heuristic's hard cutoff (10).
   */
  readonly hardSkipThreshold?: number;
}

/**
 * Estimate the player's expected score on `board` given per-cell difficulties.
 *
 * Blends three sub-strategies, exactly as the original Python heuristic:
 *
 *   1. Inverse-difficulty harvest — "you get points proportional to how
 *      easy each cell is" (small contribution).
 *   2. Hardest-first time-budget — work cells from bottom up, skip cells
 *      that are unsolvable / too hard / would blow the remaining budget.
 *   3. Easiest-first time-budget — same idea but scan in increasing
 *      difficulty order (largest contribution).
 *
 * Final score is `(0.1 * m1 + 0.7 * m2 + 0.2 * m3)` rescaled by the same
 * `multiplier = 39.48 / timeBudget` constant used in the Python original
 * (so the absolute values are comparable across budgets).
 */
export function expectedScore(
  board: readonly number[],
  cells: CellDifficulties,
  options: ExpectedScoreOptions = {},
): number {
  if (board.length !== cells.length) {
    throw new RangeError(
      `board (${board.length}) and cells (${cells.length}) length mismatch`,
    );
  }

  const timeBudget = options.timeBudget ?? 60;
  const hardSkip = options.hardSkipThreshold ?? 10;

  // Method 1 — inverse-difficulty harvest (small weight, no time budget).
  let m1 = 0;
  for (let i = 0; i < board.length; i += 1) {
    const d = cells[i];
    if (d === null || d === undefined) continue;
    if (d <= 0) continue; // skip "too trivial" cells in the inverse term
    m1 += board[i]! / d;
  }

  // Method 2 — "biggest values first" time budget. Walk cells from the
  // highest board value down (mirrors Python's `current_board.pop()` on a
  // sorted board), charging each attempted cell's difficulty against the
  // remaining budget. We sort by board value here so the heuristic is
  // independent of the caller's slot ordering — boards with pinned cells
  // are kept in positional layout, not sorted.
  type ByValue = { value: number; difficulty: number };
  const byValueDesc: ByValue[] = [];
  for (let i = 0; i < board.length; i += 1) {
    const d = cells[i];
    if (d === null || d === undefined) continue;
    byValueDesc.push({ value: board[i]!, difficulty: d });
  }
  byValueDesc.sort((a, b) => b.value - a.value);

  let m2 = 0;
  let budget2 = timeBudget;
  for (const { value, difficulty } of byValueDesc) {
    if (difficulty > hardSkip) continue;
    if (budget2 < difficulty) continue;
    budget2 -= difficulty;
    m2 += value;
  }

  // Method 3 — easiest-first time budget. Sort cells by difficulty ascending,
  // pick cells until the budget runs out.
  type Pair = { value: number; difficulty: number };
  const sorted: Pair[] = [];
  for (let i = 0; i < board.length; i += 1) {
    const d = cells[i];
    if (d === null || d === undefined) continue;
    sorted.push({ value: board[i]!, difficulty: d });
  }
  sorted.sort((a, b) => a.difficulty - b.difficulty);

  let m3 = 0;
  let budget3 = timeBudget;
  for (const { value, difficulty } of sorted) {
    if (difficulty > hardSkip) break;
    if (budget3 < difficulty) break;
    budget3 -= difficulty;
    m3 += value;
  }

  // Same blending + rescale as the Python original. The 39.48/budget term
  // makes the score scale-invariant w.r.t. the budget choice.
  const blended = m1 * 0.1 + m2 * 0.7 + m3 * 0.2;
  const multiplier = 39.48 / timeBudget;
  return round2(blended * multiplier);
}

// ---------------------------------------------------------------------------
//  Candidate ranking
// ---------------------------------------------------------------------------

/** A scored dice triple against a single board. */
export interface RankedCandidate {
  readonly dice: DiceTriple;
  readonly cells: CellDifficulties;
  readonly boardDifficulty: number;
  readonly expectedScore: number;
  readonly impossibleCount: number;
}

/**
 * Score each candidate dice triple against `board`, returning a list sorted
 * by `expectedScore` descending (best scoring first), with board difficulty as
 * a tie-breaker.
 */
export function rankCandidates(
  board: readonly number[],
  candidates: readonly DiceTriple[],
  resolver: DifficultyResolver,
  scoreOptions: ExpectedScoreOptions = {},
): RankedCandidate[] {
  const ranked: RankedCandidate[] = candidates.map((dice) => {
    const cells = scoreBoardCells(board, dice, resolver);
    const summary = summarizeBoardDifficulty(cells);
    return {
      dice,
      cells,
      boardDifficulty: summary.boardDifficulty,
      expectedScore: expectedScore(board, cells, scoreOptions),
      impossibleCount: summary.impossibleCount,
    };
  });
  ranked.sort(compareByExpectedScoreThenDifficulty);
  return ranked;
}

// ---------------------------------------------------------------------------
//  Balanced roll generator
// ---------------------------------------------------------------------------

export interface BalancedRollsOptions {
  /** Per-board expected-score config; forwarded to `rankCandidates`. */
  readonly scoreOptions?: ExpectedScoreOptions;
  /** Injectable RNG for deterministic tests. */
  readonly rng?: () => number;
  /**
   * How many improvement passes to run after the initial assignment. Each
   * pass tries every (round, swap) until no swap reduces the running
   * `|sum(P1) - sum(P2)|` delta. Default: enough to converge on small inputs.
   */
  readonly maxBalancingPasses?: number;
}

/** A single round: each player's dice triple plus the difficulty they faced. */
export interface RoundAssignment {
  readonly p1: DiceTriple;
  readonly p2: DiceTriple;
  readonly p1Difficulty: number;
  readonly p2Difficulty: number;
  readonly p1ExpectedScore: number;
  readonly p2ExpectedScore: number;
}

export interface BalancedRollsResult {
  readonly rounds: readonly RoundAssignment[];
  readonly p1TotalDifficulty: number;
  readonly p2TotalDifficulty: number;
  /** `p1TotalDifficulty - p2TotalDifficulty`. Positive = P1 had it harder. */
  readonly difficultyDelta: number;
  readonly p1TotalExpectedScore: number;
  readonly p2TotalExpectedScore: number;
  /** `p1TotalExpectedScore - p2TotalExpectedScore`. Positive = P1 should score higher. */
  readonly expectedScoreDelta: number;
}

/**
 * Generate `rounds` rounds of dice rolls for two players on `board`, drawn
 * from the supplied candidate pool. Optimizes for:
 *
 *   - Within each round, the two dice triples have similar expected scores.
 *   - Across all rounds for this board, summed expected score per player is
 *     roughly equal.
 *   - Board difficulty still acts as a guardrail so we stay in the easier
 *     half of the candidate pool.
 *
 * Algorithm:
 *
 *   1. Score every candidate against the board.
 *   2. Filter to candidates with `boardDifficulty < median(boardDifficulty)`
 *      → "easy pool". This keeps very punishing dice out of the plan.
 *   3. Sort the easy pool by `expectedScore` descending.
 *   4. Build adjacent-rank pairs from that score-ordered pool:
 *      `[r0, r1], [r2, r3], …`. These have the smallest within-pair expected
 *      score gap.
 *   5. Pick `rounds` pairs uniformly at random (without replacement). Each
 *      candidate appears in at most one round.
 *   6. Initial player assignment: alternate which player gets the slightly
 *      higher-scoring triple so running totals start near each other.
 *   7. Greedy swap improvement: for each round, try swapping (P1 ↔ P2) if
 *      it reduces the global `|sumExp(P1) - sumExp(P2)|`, using difficulty
 *      delta as a tie-breaker. Repeat until no swap helps or
 *      `maxBalancingPasses` is reached.
 *
 * Throws `RangeError` if the candidate pool is too small to provide
 * `rounds * 2` unique dice triples.
 */
export function generateBalancedRolls(
  board: readonly number[],
  candidates: readonly DiceTriple[],
  rounds: number,
  resolver: DifficultyResolver,
  options: BalancedRollsOptions = {},
): BalancedRollsResult {
  if (rounds < 1) {
    throw new RangeError(`rounds must be >= 1 (got ${rounds})`);
  }
  if (board.length !== BOARD.size) {
    throw new RangeError(
      `board must contain ${BOARD.size} cells (got ${board.length})`,
    );
  }
  if (candidates.length < rounds * 2) {
    throw new RangeError(
      `candidate pool too small: need >= ${rounds * 2} dice triples for ` +
        `${rounds} rounds (got ${candidates.length})`,
    );
  }

  const rng = options.rng ?? Math.random;
  const ranked = rankCandidates(board, candidates, resolver, options.scoreOptions);
  const byDifficulty = [...ranked].sort(compareByDifficultyThenScore);

  // Step 2 — restrict to candidates below the median boardDifficulty. We
  // operate on the difficulty-sorted list so "median" is just the midpoint
  // index.
  const median = medianBoardDifficulty(byDifficulty);
  let easyPool = byDifficulty.filter((r) => r.boardDifficulty < median);

  // If the median filter produced too few candidates (e.g. lots of ties at
  // the median), fall back to the easier half by index. This guarantees the
  // generator always succeeds when the raw pool is large enough.
  if (easyPool.length < rounds * 2) {
    easyPool = byDifficulty.slice(
      0,
      Math.max(rounds * 2, Math.ceil(byDifficulty.length / 2)),
    );
  }

  easyPool.sort(compareByExpectedScoreThenDifficulty);

  // Step 3 — adjacent-rank pairs from the score-ordered easy pool.
  const pairs = adjacentRankPairs(easyPool);
  if (pairs.length < rounds) {
    throw new RangeError(
      `not enough disjoint pairs in the easy pool (got ${pairs.length}, ` +
        `need ${rounds}); widen the candidate pool or shrink rounds`,
    );
  }

  // Step 4 — uniform random pick of `rounds` pairs without replacement.
  const chosen = sampleWithoutReplacement(pairs, rounds, rng);

  // Step 5 — initial assignment with alternating-higher-score-first.
  const assignments: RoundAssignment[] = chosen.map((pair, idx) => {
    const [higherScore, lowerScore] = pair;
    const p1GetsHigherScore = idx % 2 === 0;
    const p1 = p1GetsHigherScore ? higherScore : lowerScore;
    const p2 = p1GetsHigherScore ? lowerScore : higherScore;
    return {
      p1: p1.dice,
      p2: p2.dice,
      p1Difficulty: p1.boardDifficulty,
      p2Difficulty: p2.boardDifficulty,
      p1ExpectedScore: p1.expectedScore,
      p2ExpectedScore: p2.expectedScore,
    };
  });

  // Step 6 — greedy swap pass to minimize expected-score delta, with
  // difficulty delta as a tie-breaker.
  const balanced = balanceBySwapping(assignments, options.maxBalancingPasses ?? 8);

  let p1Sum = 0;
  let p2Sum = 0;
  let p1Score = 0;
  let p2Score = 0;
  for (const r of balanced) {
    p1Sum += r.p1Difficulty;
    p2Sum += r.p2Difficulty;
    p1Score += r.p1ExpectedScore;
    p2Score += r.p2ExpectedScore;
  }

  return {
    rounds: balanced,
    p1TotalDifficulty: round2(p1Sum),
    p2TotalDifficulty: round2(p2Sum),
    difficultyDelta: round2(p1Sum - p2Sum),
    p1TotalExpectedScore: round2(p1Score),
    p2TotalExpectedScore: round2(p2Score),
    expectedScoreDelta: round2(p1Score - p2Score),
  };
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function medianBoardDifficulty(sorted: readonly RankedCandidate[]): number {
  if (sorted.length === 0) return UNSOLVABLE_PENALTY;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid]!.boardDifficulty;
  }
  return (sorted[mid - 1]!.boardDifficulty + sorted[mid]!.boardDifficulty) / 2;
}

function compareByExpectedScoreThenDifficulty(
  a: RankedCandidate,
  b: RankedCandidate,
): number {
  return (
    b.expectedScore - a.expectedScore ||
    a.boardDifficulty - b.boardDifficulty ||
    a.impossibleCount - b.impossibleCount
  );
}

function compareByDifficultyThenScore(
  a: RankedCandidate,
  b: RankedCandidate,
): number {
  return (
    a.boardDifficulty - b.boardDifficulty ||
    b.expectedScore - a.expectedScore ||
    a.impossibleCount - b.impossibleCount
  );
}

function adjacentRankPairs(
  sorted: readonly RankedCandidate[],
): Array<readonly [RankedCandidate, RankedCandidate]> {
  const pairs: Array<readonly [RankedCandidate, RankedCandidate]> = [];
  for (let i = 0; i + 1 < sorted.length; i += 2) {
    pairs.push([sorted[i]!, sorted[i + 1]!] as const);
  }
  return pairs;
}

function sampleWithoutReplacement<T>(
  items: readonly T[],
  count: number,
  rng: () => number,
): T[] {
  const pool = [...items];
  const chosen: T[] = [];
  while (chosen.length < count && pool.length > 0) {
    const idx = Math.floor(rng() * pool.length);
    const safeIdx = Math.min(idx, pool.length - 1);
    chosen.push(pool[safeIdx]!);
    pool.splice(safeIdx, 1);
  }
  return chosen;
}

function balanceBySwapping(
  rounds: readonly RoundAssignment[],
  maxPasses: number,
): RoundAssignment[] {
  const exact = balanceExactly(rounds);
  if (exact !== null) return exact;

  const out: RoundAssignment[] = rounds.map((r) => ({ ...r }));

  const sumDeltas = (
    rs: readonly RoundAssignment[],
  ): { expectedScore: number; difficulty: number } => {
    let p1 = 0;
    let p2 = 0;
    let p1Difficulty = 0;
    let p2Difficulty = 0;
    for (const r of rs) {
      p1 += r.p1ExpectedScore;
      p2 += r.p2ExpectedScore;
      p1Difficulty += r.p1Difficulty;
      p2Difficulty += r.p2Difficulty;
    }
    return {
      expectedScore: Math.abs(p1 - p2),
      difficulty: Math.abs(p1Difficulty - p2Difficulty),
    };
  };

  for (let pass = 0; pass < maxPasses; pass += 1) {
    let improved = false;
    let bestDelta = sumDeltas(out);
    for (let i = 0; i < out.length; i += 1) {
      const swapped = swapRound(out[i]!);
      const trial = [...out];
      trial[i] = swapped;
      const trialDelta = sumDeltas(trial);
      if (
        trialDelta.expectedScore < bestDelta.expectedScore ||
        (trialDelta.expectedScore === bestDelta.expectedScore &&
          trialDelta.difficulty < bestDelta.difficulty)
      ) {
        out[i] = swapped;
        bestDelta = trialDelta;
        improved = true;
      }
    }
    if (!improved) break;
  }
  return out;
}

function balanceExactly(rounds: readonly RoundAssignment[]): RoundAssignment[] | null {
  const MAX_EXACT_ROUNDS = 16;
  if (rounds.length === 0 || rounds.length > MAX_EXACT_ROUNDS) {
    return null;
  }

  let bestMask = 0;
  let bestExpectedDelta = Number.POSITIVE_INFINITY;
  let bestDifficultyDelta = Number.POSITIVE_INFINITY;
  const combinations = 1 << rounds.length;

  for (let mask = 0; mask < combinations; mask += 1) {
    let p1Score = 0;
    let p2Score = 0;
    let p1Difficulty = 0;
    let p2Difficulty = 0;

    for (let i = 0; i < rounds.length; i += 1) {
      const round = rounds[i]!;
      const swapped = (mask & (1 << i)) !== 0;
      if (swapped) {
        p1Score += round.p2ExpectedScore;
        p2Score += round.p1ExpectedScore;
        p1Difficulty += round.p2Difficulty;
        p2Difficulty += round.p1Difficulty;
      } else {
        p1Score += round.p1ExpectedScore;
        p2Score += round.p2ExpectedScore;
        p1Difficulty += round.p1Difficulty;
        p2Difficulty += round.p2Difficulty;
      }
    }

    const expectedDelta = Math.abs(p1Score - p2Score);
    const difficultyDelta = Math.abs(p1Difficulty - p2Difficulty);
    if (
      expectedDelta < bestExpectedDelta ||
      (expectedDelta === bestExpectedDelta &&
        difficultyDelta < bestDifficultyDelta)
    ) {
      bestMask = mask;
      bestExpectedDelta = expectedDelta;
      bestDifficultyDelta = difficultyDelta;
    }
  }

  return rounds.map((round, i) =>
    (bestMask & (1 << i)) !== 0 ? swapRound(round) : { ...round },
  );
}

function swapRound(r: RoundAssignment): RoundAssignment {
  return {
    p1: r.p2,
    p2: r.p1,
    p1Difficulty: r.p2Difficulty,
    p2Difficulty: r.p1Difficulty,
    p1ExpectedScore: r.p2ExpectedScore,
    p2ExpectedScore: r.p1ExpectedScore,
  };
}
