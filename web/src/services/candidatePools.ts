/**
 * Predefined dice candidate pools used by the Compose feature.
 *
 *   - Standard (38)  — the depowered 2/3/5/7/11/13/17/19 list, identical to
 *     `DICE_COMBINATIONS` from the solver. Mirrors the original game's
 *     "normal" dice set.
 *   - Extensive       — every unordered (a, b, c) triple in `[1, 20]`,
 *     filtered to drop the all-same triples (the game forbids them). Built
 *     lazily once on first access; ~1,540 entries.
 */
import type { DiceTriple } from "../core/types";
import { DICE_COMBINATIONS as STANDARD } from "@solver/core/constants.js";

export type CandidatePoolId = "standard" | "extensive";

export interface CandidatePoolMeta {
  readonly id: CandidatePoolId;
  readonly label: string;
  readonly description: string;
  readonly size: number;
}

const STANDARD_POOL: readonly DiceTriple[] = STANDARD;

let extensiveCache: readonly DiceTriple[] | null = null;
function buildExtensive(): readonly DiceTriple[] {
  if (extensiveCache !== null) return extensiveCache;
  const triples: DiceTriple[] = [];
  for (let a = 1; a <= 20; a += 1) {
    for (let b = a; b <= 20; b += 1) {
      for (let c = b; c <= 20; c += 1) {
        if (a === b && b === c) continue;
        triples.push([a, b, c]);
      }
    }
  }
  extensiveCache = triples;
  return triples;
}

export function getCandidatePool(id: CandidatePoolId): readonly DiceTriple[] {
  return id === "standard" ? STANDARD_POOL : buildExtensive();
}

export const CANDIDATE_POOLS: readonly CandidatePoolMeta[] = [
  {
    id: "standard",
    label: "Standard (38)",
    description: "The original depowered dice list — fast to load.",
    size: STANDARD_POOL.length,
  },
  {
    id: "extensive",
    label: "Extensive (1,540)",
    description: "Every unordered (a, b, c) ∈ [1, 20]. Slower to fetch.",
    size: 1540,
  },
];
