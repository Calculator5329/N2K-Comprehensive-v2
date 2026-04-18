import { OPERATOR_TO_SYMBOL, SYMBOL_TO_OPERATOR } from "../core/constants.js";
import type { Equation, Operator, OperatorSymbol } from "../core/types.js";

/** Format an operator code as a printable, padded symbol (e.g. " + "). */
export function operatorToString(op: Operator): string {
  return ` ${OPERATOR_TO_SYMBOL[op]} `;
}

/**
 * Parse a printable operator (with or without surrounding whitespace) into
 * its `Operator` code. Throws on unknown input.
 */
export function parseOperator(token: string): Operator {
  const trimmed = token.trim();
  if (!(trimmed in SYMBOL_TO_OPERATOR)) {
    throw new SyntaxError(`Unknown operator: "${token}"`);
  }
  return SYMBOL_TO_OPERATOR[trimmed as OperatorSymbol];
}

/** Pretty-print an equation, e.g. `2^5 + 2^2 + 2^2 = 40`. */
export function formatEquation(eq: Equation): string {
  return (
    `${eq.d1}^${eq.p1}${operatorToString(eq.o1)}` +
    `${eq.d2}^${eq.p2}${operatorToString(eq.o2)}` +
    `${eq.d3}^${eq.p3} = ${eq.total}`
  );
}

/**
 * Parse an equation string of the form `d1^p1 OP d2^p2 OP d3^p3 = total`.
 *
 * Whitespace between tokens is flexible. Throws `SyntaxError` on any
 * malformed input so callers can catch and report a single error rather than
 * dealing with `IndexError` / `NaN` propagation (the Python original would
 * crash the entire REPL on a typo).
 */
export function parseEquation(input: string): Equation {
  const tokens = input.trim().split(/\s+/);
  if (tokens.length !== 7) {
    throw new SyntaxError(
      `Expected 7 tokens (e.g. "2^5 + 2^2 + 2^2 = 40"), got ${tokens.length}`,
    );
  }

  const [base1, opA, base2, opB, base3, eq, totalStr] = tokens as [
    string, string, string, string, string, string, string,
  ];

  if (eq !== "=") {
    throw new SyntaxError(`Expected '=' before total, got "${eq}"`);
  }

  const [d1, p1] = parseBase(base1);
  const [d2, p2] = parseBase(base2);
  const [d3, p3] = parseBase(base3);
  const o1 = parseOperator(opA);
  const o2 = parseOperator(opB);
  const total = parseIntStrict(totalStr, "total");

  return { d1, d2, d3, p1, p2, p3, o1, o2, total };
}

function parseBase(token: string): [number, number] {
  const parts = token.split("^");
  if (parts.length !== 2) {
    throw new SyntaxError(`Expected "<dice>^<exp>", got "${token}"`);
  }
  return [parseIntStrict(parts[0]!, "dice"), parseIntStrict(parts[1]!, "exponent")];
}

function parseIntStrict(token: string, label: string): number {
  if (!/^-?\d+$/.test(token)) {
    throw new SyntaxError(`Expected integer for ${label}, got "${token}"`);
  }
  return Number.parseInt(token, 10);
}
