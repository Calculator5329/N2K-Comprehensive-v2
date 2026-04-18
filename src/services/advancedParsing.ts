import type { NEquation, Operator } from "../core/types.js";
import { operatorToString, parseOperator } from "./parsing.js";

/**
 * N-arity parser/printer for advanced-mode equations. Supports negative
 * dice values via parenthesized notation:
 *
 *   "(-3)^4 + 2^5 = 113"
 *
 * Bare leading minus on a base (`-3^4`) is also accepted on parse and
 * treated as `((-3))^4`, which is unambiguous because operators in N2K
 * are always whitespace-separated tokens.
 */

/** Pretty-print an N-arity equation. */
export function formatNEquation(eq: NEquation): string {
  if (eq.dice.length < 3 || eq.dice.length > 5) {
    throw new RangeError(
      `formatNEquation: arity must be 3..5 (got ${eq.dice.length})`,
    );
  }
  if (eq.exps.length !== eq.dice.length) {
    throw new RangeError(
      `formatNEquation: exps.length (${eq.exps.length}) must equal arity`,
    );
  }
  if (eq.ops.length !== eq.dice.length - 1) {
    throw new RangeError(
      `formatNEquation: ops.length (${eq.ops.length}) must equal arity - 1`,
    );
  }
  const parts: string[] = [];
  for (let i = 0; i < eq.dice.length; i += 1) {
    parts.push(formatBase(eq.dice[i]!, eq.exps[i]!));
    if (i < eq.ops.length) parts.push(operatorToString(eq.ops[i]!).trim());
  }
  return `${parts.join(" ")} = ${eq.total}`;
}

/** Parenthesize negative bases so the reader can't misread `-3^4`. */
function formatBase(d: number, p: number): string {
  return d < 0 ? `(${d})^${p}` : `${d}^${p}`;
}

/**
 * Parse an N-arity equation string.
 *
 * Token shape: `<base>^<exp> <op> <base>^<exp> ... = <total>`
 * Token count must be `2 * arity + 1` (1 base/exp per dice, op between
 * each pair, plus `= total`).
 *
 * Throws `SyntaxError` on any malformed input — never returns garbage.
 */
export function parseNEquation(input: string): NEquation {
  const tokens = input.trim().split(/\s+/);
  if (tokens.length < 7 || tokens.length % 2 === 0) {
    throw new SyntaxError(
      `parseNEquation: expected 7, 9, or 11 tokens, got ${tokens.length}`,
    );
  }
  const arity = (tokens.length - 1) / 2;
  if (arity < 3 || arity > 5) {
    throw new SyntaxError(
      `parseNEquation: arity must be 3, 4, or 5 (token shape implied ${arity})`,
    );
  }

  const dice: number[] = new Array(arity);
  const exps: number[] = new Array(arity);
  const ops: Operator[] = new Array(arity - 1);

  for (let i = 0; i < arity; i += 1) {
    const baseTok = tokens[2 * i]!;
    const [d, p] = parseBase(baseTok);
    dice[i] = d;
    exps[i] = p;
    if (i < arity - 1) {
      ops[i] = parseOperator(tokens[2 * i + 1]!);
    }
  }

  const eqSign = tokens[tokens.length - 2]!;
  if (eqSign !== "=") {
    throw new SyntaxError(`parseNEquation: expected '=' before total, got "${eqSign}"`);
  }
  const totalStr = tokens[tokens.length - 1]!;
  if (!/^-?\d+$/.test(totalStr)) {
    throw new SyntaxError(`parseNEquation: expected integer total, got "${totalStr}"`);
  }
  const total = Number.parseInt(totalStr, 10);
  return { dice, exps, ops, total };
}

const BASE_RE = /^(?:(-?\d+)|\((-?\d+)\))\^(\d+)$/;

function parseBase(token: string): [number, number] {
  const m = BASE_RE.exec(token);
  if (!m) {
    throw new SyntaxError(`parseNEquation: expected "<dice>^<exp>", got "${token}"`);
  }
  const dStr = m[1] ?? m[2]!;
  return [Number.parseInt(dStr, 10), Number.parseInt(m[3]!, 10)];
}
