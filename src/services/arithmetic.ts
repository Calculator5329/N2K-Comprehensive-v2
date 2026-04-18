import { OP } from "../core/constants.js";
import type { Operator } from "../core/types.js";

/**
 * Apply an operator to two numbers. Throws on unknown operator codes so that
 * invalid enumerations fail loudly instead of silently returning `undefined`.
 */
export function applyOperator(a: number, b: number, op: Operator): number {
  switch (op) {
    case OP.ADD:
      return a + b;
    case OP.SUB:
      return a - b;
    case OP.MUL:
      return a * b;
    case OP.DIV:
      return a / b;
    default:
      throw new Error(`applyOperator: unknown operator ${String(op)}`);
  }
}

/**
 * Evaluate an N2K expression of the form `n1 o1 n2 o2 n3` using strict
 * left-to-right evaluation (no operator precedence), matching the original
 * game rules.
 */
export function evaluateLeftToRight(
  n1: number,
  n2: number,
  n3: number,
  o1: Operator,
  o2: Operator,
): number {
  return applyOperator(applyOperator(n1, n2, o1), n3, o2);
}

/** All 6 permutations of a 3-element tuple, returned in stable order. */
export function permutationsOf3<T>(
  a: T,
  b: T,
  c: T,
): ReadonlyArray<readonly [T, T, T]> {
  return [
    [a, b, c],
    [a, c, b],
    [b, a, c],
    [b, c, a],
    [c, a, b],
    [c, b, a],
  ];
}

// ---------------------------------------------------------------------------
//  N-arity helpers — used by Advanced Mode (the secret Æther edition)
// ---------------------------------------------------------------------------

/**
 * Evaluate `values[0] ops[0] values[1] ops[1] values[2] ...` strictly
 * left-to-right (no precedence). Returns `NaN` when the chain produces a
 * non-finite intermediate (e.g. divide-by-zero) or when any intermediate's
 * absolute value exceeds `safeMagnitude`.
 *
 * Returning `NaN` lets the solver `Number.isFinite`-skip without throwing.
 */
export function evaluateLeftToRightN(
  values: readonly number[],
  ops: readonly Operator[],
  safeMagnitude: number = Number.POSITIVE_INFINITY,
): number {
  if (values.length === 0) return Number.NaN;
  if (ops.length !== values.length - 1) {
    throw new RangeError(
      `evaluateLeftToRightN: ops.length (${ops.length}) must equal ` +
        `values.length - 1 (${values.length - 1})`,
    );
  }
  let acc = values[0]!;
  if (Math.abs(acc) > safeMagnitude) return Number.NaN;
  for (let i = 0; i < ops.length; i += 1) {
    acc = applyOperator(acc, values[i + 1]!, ops[i]!);
    if (!Number.isFinite(acc)) return Number.NaN;
    if (Math.abs(acc) > safeMagnitude) return Number.NaN;
  }
  return acc;
}

/**
 * Generate every permutation of `items` via Heap's algorithm. Yields
 * fresh arrays (callers may keep them); time complexity O(n! · n).
 *
 * For small N (3..5) this beats allocating-all upfront because callers
 * typically short-circuit the inner loop.
 */
export function* permutations<T>(
  items: readonly T[],
): Generator<readonly T[]> {
  const a = items.slice();
  const n = a.length;
  if (n === 0) {
    yield [];
    return;
  }
  yield a.slice();
  const c = new Array<number>(n).fill(0);
  let i = 0;
  while (i < n) {
    if (c[i]! < i) {
      if ((i & 1) === 0) {
        const tmp = a[0]!;
        a[0] = a[i]!;
        a[i] = tmp;
      } else {
        const k = c[i]!;
        const tmp = a[k]!;
        a[k] = a[i]!;
        a[i] = tmp;
      }
      yield a.slice();
      c[i] = c[i]! + 1;
      i = 0;
    } else {
      c[i] = 0;
      i += 1;
    }
  }
}

/**
 * Like {@link permutations} but skips duplicate orderings when `items`
 * contains repeated values. Yields exactly `n! / (n1! · n2! · …)` arrays
 * where `nk` is the count of each distinct value.
 *
 * Cuts the constant factor for ties (e.g. `(2, 2, 2)` yields 1 result
 * instead of 6) which is the common case in the solver hot loop.
 *
 * Items are compared with `===`, so this is intended for primitives.
 */
export function* distinctPermutations<T>(
  items: readonly T[],
): Generator<readonly T[]> {
  const sorted = items.slice().sort((a, b) => {
    if (a === b) return 0;
    return (a as unknown as number) < (b as unknown as number) ? -1 : 1;
  });
  const n = sorted.length;
  const used = new Array<boolean>(n).fill(false);
  const current: T[] = [];

  function* recurse(): Generator<readonly T[]> {
    if (current.length === n) {
      yield current.slice();
      return;
    }
    for (let i = 0; i < n; i += 1) {
      if (used[i]) continue;
      // Skip a duplicate value if the equal item to its left is unused —
      // forces left-to-right consumption of equal items, eliminating
      // the duplicate orderings.
      if (i > 0 && sorted[i] === sorted[i - 1] && !used[i - 1]) continue;
      used[i] = true;
      current.push(sorted[i]!);
      yield* recurse();
      current.pop();
      used[i] = false;
    }
  }

  yield* recurse();
}
