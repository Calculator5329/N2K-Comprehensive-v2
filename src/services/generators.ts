import { BOARD } from "../core/constants.js";
import type { DiceTriple } from "../core/types.js";

/** Inclusive integer in [min, max]. */
function randomInt(min: number, max: number, rng: () => number = Math.random): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * Generate a `BOARD.size`-element board of unique random integers in
 * `[min, max]`, sorted ascending.
 *
 * Throws if the range cannot accommodate `BOARD.size` unique values.
 *
 * Backwards-compatible signature: `generateRandomBoard(highestNum)` still
 * works and yields values in `[1, highestNum]`. Pass `{ min, max }` to use
 * a custom range.
 */
export function generateRandomBoard(
  rangeOrHighest: number | { min?: number; max: number } = 999,
  rng: () => number = Math.random,
): number[] {
  const min = typeof rangeOrHighest === "number" ? 1 : (rangeOrHighest.min ?? 1);
  const max =
    typeof rangeOrHighest === "number" ? rangeOrHighest : rangeOrHighest.max;

  if (max < min) {
    throw new RangeError(`max (${max}) must be >= min (${min})`);
  }
  if (max - min + 1 < BOARD.size) {
    throw new RangeError(
      `range [${min}, ${max}] has fewer than ${BOARD.size} integers; cannot fit a unique board`,
    );
  }

  const seen = new Set<number>();
  while (seen.size < BOARD.size) {
    seen.add(randomInt(min, max, rng));
  }
  return [...seen].sort((a, b) => a - b);
}

/**
 * Generate a board of values following an arithmetic pattern.
 *
 * - `multiples.length === 1`: simple arithmetic progression of length
 *   `BOARD.size` with common difference `multiples[0]`.
 * - `multiples.length === 2`: alternating progression that emits `BOARD.size`
 *   values in pairs, advancing by `multiples[0] + multiples[1]` per pair.
 * - `multiples.length === 3`: triple-step progression that emits `BOARD.size`
 *   values in triples, advancing by `multiples[0] + multiples[1] + multiples[2]`
 *   per triple. Mirrors the original Python `generate_pattern_board`.
 *
 * Throws on `multiples.length === 0` or `> 3` so callers cannot silently
 * receive an empty array.
 */
export function generatePatternBoard(
  multiples: readonly number[] = [6],
  startingNumber = 6,
): number[] {
  if (multiples.length === 0 || multiples.length > 3) {
    throw new RangeError(
      `multiples must have 1, 2, or 3 elements (got ${multiples.length})`,
    );
  }

  const board: number[] = [];

  if (multiples.length === 1) {
    const step = multiples[0]!;
    for (let i = 0; i < BOARD.size; i += 1) {
      board.push(startingNumber + i * step);
    }
    return board;
  }

  if (multiples.length === 2) {
    const stepA = multiples[0]!;
    const stepB = multiples[1]!;
    for (let i = 0; i < BOARD.size / 2; i += 1) {
      const base = startingNumber + i * stepA + i * stepB;
      board.push(base);
      board.push(base + stepA);
    }
    return board;
  }

  // 3 multiples — Python parity: every "round" advances by a+b+c, and emits
  // base, base+a, base+a+b. Adjusts the starting number up to keep all
  // values non-negative when the multiples include negatives.
  const stepA = multiples[0]!;
  const stepB = multiples[1]!;
  const stepC = multiples[2]!;
  let mostNegative = 0;
  for (const m of multiples) {
    if (m < 0) mostNegative += m;
  }
  const safeStart = startingNumber - mostNegative;

  const groupCount = Math.floor(BOARD.size / 3);
  for (let i = 0; i < groupCount; i += 1) {
    const base = safeStart + i * (stepA + stepB + stepC);
    board.push(base);
    board.push(base + stepA);
    board.push(base + stepA + stepB);
  }
  return board;
}

/**
 * Roll three dice. The first two are constrained to `[minDice, maxDice]`,
 * the third to `[minDice, lastMaxDice]`, and the same value cannot appear on
 * all three dice.
 */
export function generateRandomDice(
  options: { minDice?: number; maxDice?: number; lastMaxDice?: number } = {},
  rng: () => number = Math.random,
): DiceTriple {
  const { minDice = 1, maxDice = 10, lastMaxDice = 20 } = options;

  const roll = (): DiceTriple => [
    randomInt(minDice, maxDice, rng),
    randomInt(minDice, maxDice, rng),
    randomInt(minDice, lastMaxDice, rng),
  ];

  let dice = roll();
  while (dice[0] === dice[1] && dice[1] === dice[2]) {
    dice = roll();
  }
  return dice;
}

// ---------------------------------------------------------------------------
//  BoardSpec — declarative board generation with per-cell overrides
// ---------------------------------------------------------------------------

/** A pinned board cell: at the given linear slot index, force this value. */
export interface BoardOverride {
  /** Slot index in the post-sort board, `0..BOARD.size-1`. */
  readonly slot: number;
  readonly value: number;
}

/** Random board spec: `BOARD.size` unique random ints in `[min, max]`. */
export interface RandomBoardSpec {
  readonly kind: "random";
  readonly range: { readonly min: number; readonly max: number };
  /** Optional fixed cells. Slots are post-sort indices `[0, BOARD.size)`. */
  readonly overrides?: readonly BoardOverride[];
}

/** Pattern board spec: arithmetic progression with 1, 2, or 3 multiples. */
export interface PatternBoardSpec {
  readonly kind: "pattern";
  readonly multiples: readonly number[];
  readonly start: number;
  readonly overrides?: readonly BoardOverride[];
}

export type BoardSpec = RandomBoardSpec | PatternBoardSpec;

/**
 * Build a board from a {@link BoardSpec}, applying any per-slot overrides.
 *
 * Pipeline:
 *
 *   1. Generate the base board (random or pattern).
 *   2. If overrides are supplied, place every override value at its named
 *      slot index. The remaining (non-overridden) slots are filled from
 *      the generated base, **preserving the user-visible slot layout** so
 *      pinned cells stay where the user clicked.
 *
 * Sort policy:
 *
 *   - **No overrides**: the result is sorted ascending (back-compat with
 *     `generateRandomBoard` / `generatePatternBoard`, which the rest of
 *     the solver and tests rely on).
 *   - **With overrides**: the result is *positional* — each slot index
 *     reflects the cell's row/column on the 6×6 board, not its rank.
 *     This avoids the visual duplication bug where a pinned value would
 *     show up twice on screen (once at its pinned slot, once at its
 *     sorted-rank slot).
 *
 * The competition algorithms (`expectedScore`, `summarizeBoardDifficulty`)
 * are order-independent so this layout choice is purely cosmetic from
 * their perspective.
 *
 * Validation:
 *   - All overrides must have `slot` in `[0, BOARD.size)`.
 *   - Override slots must be unique.
 *   - Override values must be unique.
 *   - After applying overrides, all 36 values must be unique.
 */
export function generateBoard(
  spec: BoardSpec,
  rng: () => number = Math.random,
): number[] {
  const overrides = spec.overrides ?? [];
  validateOverrides(overrides);

  // Fast path: no overrides — return the canonical sorted board.
  if (overrides.length === 0) {
    if (spec.kind === "random") return generateRandomBoard(spec.range, rng);
    return generatePatternBoard(spec.multiples, spec.start);
  }

  const overrideBySlot = new Map(overrides.map((o) => [o.slot, o.value] as const));
  const overrideValues = new Set(overrides.map((o) => o.value));
  const slotsToFill = BOARD.size - overrides.length;

  // Build the pool of values to drop into the non-overridden slots.
  let fillValues: number[];
  if (spec.kind === "random") {
    fillValues = fillRandomAroundOverrides(
      spec.range.min,
      spec.range.max,
      slotsToFill,
      overrideValues,
      rng,
    );
  } else {
    // For pattern boards, take the original pattern values at the
    // non-overridden slot positions so the visual progression survives.
    const pattern = generatePatternBoard(spec.multiples, spec.start);
    fillValues = [];
    for (let slot = 0; slot < BOARD.size; slot += 1) {
      if (overrideBySlot.has(slot)) continue;
      const v = pattern[slot]!;
      if (overrideValues.has(v)) {
        throw new RangeError(
          `Override value ${v} collides with the natural pattern value at ` +
            `slot ${pattern.indexOf(v)}; pick a different override or pattern`,
        );
      }
      fillValues.push(v);
    }
  }

  // Splice fillValues into the non-overridden slots in order, leaving
  // overrides pinned at the slot indices the user picked.
  const merged: number[] = new Array<number>(BOARD.size);
  let cursor = 0;
  for (let slot = 0; slot < BOARD.size; slot += 1) {
    const pinned = overrideBySlot.get(slot);
    if (pinned !== undefined) {
      merged[slot] = pinned;
    } else {
      merged[slot] = fillValues[cursor]!;
      cursor += 1;
    }
  }

  if (new Set(merged).size !== merged.length) {
    throw new RangeError(
      `Board contains duplicate values after applying overrides; ` +
        `pick override values that don't collide with the generated cells`,
    );
  }

  return merged;
}

function validateOverrides(overrides: readonly BoardOverride[]): void {
  const slots = new Set<number>();
  const values = new Set<number>();
  for (const o of overrides) {
    if (!Number.isInteger(o.slot) || o.slot < 0 || o.slot >= BOARD.size) {
      throw new RangeError(
        `Override slot ${o.slot} out of range [0, ${BOARD.size})`,
      );
    }
    if (slots.has(o.slot)) {
      throw new RangeError(`Duplicate override for slot ${o.slot}`);
    }
    if (values.has(o.value)) {
      throw new RangeError(`Duplicate override value ${o.value}`);
    }
    slots.add(o.slot);
    values.add(o.value);
  }
}

function fillRandomAroundOverrides(
  min: number,
  max: number,
  count: number,
  reserved: ReadonlySet<number>,
  rng: () => number,
): number[] {
  const available = max - min + 1 - reserved.size;
  if (available < count) {
    throw new RangeError(
      `range [${min}, ${max}] (minus ${reserved.size} reserved values) ` +
        `has ${available} integers; need ${count} more cells`,
    );
  }
  const seen = new Set<number>();
  while (seen.size < count) {
    const v = randomInt(min, max, rng);
    if (reserved.has(v)) continue;
    seen.add(v);
  }
  return [...seen];
}
