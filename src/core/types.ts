/**
 * Shared domain types for the N2K solver.
 *
 * An N2K equation has the shape:  d1^p1  o1  d2^p2  o2  d3^p3  =  total
 * where each `d` is a dice value, each `p` is an exponent, and each `o` is
 * an arithmetic operator.
 */

/** Numeric encoding of an arithmetic operator. */
export type Operator = 1 | 2 | 3 | 4;

/** Printable forms of the four supported operators. */
export type OperatorSymbol = "+" | "-" | "*" | "/";

/** Three dice values that define a single N2K turn. */
export type DiceTriple = readonly [number, number, number];

/** A fully-specified N2K equation. */
export interface Equation {
  readonly d1: number;
  readonly d2: number;
  readonly d3: number;
  readonly p1: number;
  readonly p2: number;
  readonly p3: number;
  readonly o1: Operator;
  readonly o2: Operator;
  readonly total: number;
}

/** Inputs to the solver: three dice rolls plus the target board number. */
export interface SolverInput {
  readonly dice: DiceTriple;
  readonly total: number;
}

// ---------------------------------------------------------------------------
//  Advanced Mode (the secret Æther edition) — variable-arity equations
// ---------------------------------------------------------------------------

/** Supported arities in advanced mode. */
export type Arity = 3 | 4 | 5;

/**
 * A fully-specified N-arity N2K equation. Generalization of {@link Equation}
 * that supports 3, 4, or 5 dice and tolerates negative / zero dice values.
 *
 * Invariants (enforced by the advanced solver, not by the type):
 *   - `dice.length === exps.length`
 *   - `ops.length === dice.length - 1`
 *   - `dice.length ∈ {3, 4, 5}`
 */
export interface NEquation {
  readonly dice: readonly number[];
  readonly exps: readonly number[];
  readonly ops:  readonly Operator[];
  readonly total: number;
}
