/// <reference lib="webworker" />

/**
 * Web Worker entry for the advanced (Æther) on-demand solver.
 *
 * Supports two request kinds, both off the main thread:
 *
 *   1. `solve`  — auto-arity easiest equation for a single target.
 *                 Used by Lookup-style "give me the answer" flows.
 *
 *   2. `sweep`  — solve every target in `[minTotal, maxTotal]` for a
 *                 single fixed-arity tuple in one enumeration of the
 *                 equation space. This is the per-tuple primitive that
 *                 powers Compare's curves, Visualize's heat ribbons,
 *                 Explore's lazy summaries, etc. Far cheaper than
 *                 calling `solve` 5,000 times because operator/exponent
 *                 enumeration is amortized.
 *
 * Protocol (matches `solverWorker.ts` shape):
 *   - Request:  `{ id, kind, ...args }`
 *   - Response: `{ id, kind: "ok"|"error", ...payload }`
 *
 * `id` is opaque to the worker; the service uses it to route replies
 * back to the right Promise.
 */
import { easiestAdvanced, solveAdvancedForAllTargets } from "@solver/services/advancedSolver.js";
import { advDifficultyOfEquation } from "@solver/services/advancedDifficulty.js";
import { formatNEquation } from "@solver/services/advancedParsing.js";

// ---------------------------------------------------------------------------
//  Wire types
// ---------------------------------------------------------------------------

export interface AetherSolveRequest {
  readonly id: number;
  readonly kind: "solve";
  readonly dice: readonly number[];
  readonly total: number;
}

export interface AetherSweepRequest {
  readonly id: number;
  readonly kind: "sweep";
  readonly dice: readonly number[];
  readonly minTotal: number;
  readonly maxTotal: number;
}

export type AetherWorkerRequest = AetherSolveRequest | AetherSweepRequest;

export interface AetherWorkerSolution {
  readonly equation: string;
  readonly arity: number;
  readonly difficulty: number;
  readonly elapsedMs: number;
}

/**
 * One per-target row of a sweep response. Kept as a tuple-style array
 * (not a `{target,…}` object) so the wire payload stays compact for
 * the common case of 5,000 entries.
 */
export type AetherSweepRow = readonly [
  target: number,
  equation: string,
  difficulty: number,
];

export interface AetherSweepResult {
  readonly arity: number;
  readonly elapsedMs: number;
  /** Solvable targets only; ordered ascending by target. */
  readonly rows: readonly AetherSweepRow[];
}

export type AetherWorkerResponse =
  | { readonly id: number; readonly kind: "solve-ok"; readonly solution: AetherWorkerSolution | null }
  | { readonly id: number; readonly kind: "sweep-ok"; readonly sweep: AetherSweepResult }
  | { readonly id: number; readonly kind: "error";    readonly message: string };

// ---------------------------------------------------------------------------
//  Worker entry
// ---------------------------------------------------------------------------

const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.addEventListener("message", (event: MessageEvent<AetherWorkerRequest>) => {
  const req = event.data;
  try {
    if (req.kind === "solve") {
      handleSolve(req);
    } else {
      handleSweep(req);
    }
  } catch (err) {
    const response: AetherWorkerResponse = {
      id: req.id,
      kind: "error",
      message: err instanceof Error ? err.message : String(err),
    };
    ctx.postMessage(response);
  }
});

function handleSolve(req: AetherSolveRequest): void {
  const t0 = performance.now();
  const eq = easiestAdvanced({ dice: req.dice, total: req.total });
  const elapsedMs = performance.now() - t0;
  const solution: AetherWorkerSolution | null = eq === null ? null : {
    equation: formatNEquation(eq),
    arity: eq.dice.length,
    difficulty: advDifficultyOfEquation(eq),
    elapsedMs,
  };
  const response: AetherWorkerResponse = { id: req.id, kind: "solve-ok", solution };
  ctx.postMessage(response);
}

function handleSweep(req: AetherSweepRequest): void {
  const t0 = performance.now();
  const map = solveAdvancedForAllTargets(req.dice, req.minTotal, req.maxTotal);
  const targets = [...map.keys()].sort((a, b) => a - b);
  const rows: AetherSweepRow[] = new Array(targets.length);
  for (let i = 0; i < targets.length; i += 1) {
    const t = targets[i]!;
    const sol = map.get(t)!;
    rows[i] = [t, formatNEquation(sol.equation), sol.difficulty];
  }
  const elapsedMs = performance.now() - t0;
  const response: AetherWorkerResponse = {
    id: req.id,
    kind: "sweep-ok",
    sweep: { arity: req.dice.length, elapsedMs, rows },
  };
  ctx.postMessage(response);
}
