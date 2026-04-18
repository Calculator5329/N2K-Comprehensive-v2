import { ADV_DICE_RANGE, ADV_TARGET_RANGE } from "@solver/core/constants.js";
import type { DatasetIndex, Loadable } from "../core/types";
import { useStore } from "./storeContext";

/**
 * Synthetic dataset-index view for Æther mode.
 *
 * Page-shell layouts read four fields off `DataStore.index` for the
 * masthead/sidebar stats strip — `diceTriplesTotal`, `recordsWritten`,
 * `totalMin`, `totalMax`. In standard mode these come from the bundled
 * `index.json` and describe the on-disk catalog. In Æther mode there is
 * no precomputed dataset (every sweep is on-demand via the worker
 * pool), so the bundled index would silently misrepresent the active
 * scope: a footer claiming "1,540 triples · targets 1–999" while the
 * user is exploring 5-arity tuples up to 5,000.
 *
 * `useAlmanacIndex` returns a swap that re-uses the standard index
 * envelope (so layouts keep working unchanged) but substitutes the
 * fields that change between modes:
 *
 *   - `diceMin/diceMax`/`totalMin/totalMax` → `ADV_DICE_RANGE` /
 *     `ADV_TARGET_RANGE` constants from the core layer.
 *   - `diceTriplesTotal` → combinatorial size of the full Æther
 *     universe across arities 3, 4, and 5 (≈1.71 M unordered tuples).
 *   - `recordsWritten` → `AetherDataStore.cacheSize` — the number of
 *     tuples whose sweep has been computed in this session. Honest
 *     "live" counter that grows as the user explores; starts at zero.
 *
 * `generatedAt` is reused from the standard index so the "compiled"
 * date keeps a sensible value.
 *
 * The hook degrades gracefully: if the standard index is still loading
 * or errored, the standard `Loadable` wrapper is returned untouched in
 * standard mode; in Æther mode we synthesize a `ready` envelope
 * regardless because the Æther values are derived from constants and
 * an in-memory store.
 */

/** Combinatorial count of unordered multisets of size k drawn from n values. */
function multisetCount(n: number, k: number): number {
  let num = 1;
  let den = 1;
  for (let i = 1; i <= k; i += 1) {
    num *= n + k - i;
    den *= i;
  }
  return num / den;
}

const DICE_VALUE_COUNT = ADV_DICE_RANGE.max - ADV_DICE_RANGE.min + 1;

/**
 * Total number of unordered Æther tuples across arities 3, 4, 5 over the
 * full advanced dice range. Computed once at module load.
 */
export const AETHER_UNIVERSE_TUPLE_COUNT: number =
  multisetCount(DICE_VALUE_COUNT, 3) +
  multisetCount(DICE_VALUE_COUNT, 4) +
  multisetCount(DICE_VALUE_COUNT, 5);

export function useAlmanacIndex(): Loadable<DatasetIndex> {
  const { data, secret, aetherData } = useStore();

  if (!secret.aetherActive) return data.index;

  // In Æther mode we always return a ready envelope. Reading
  // `cacheSize` (a computed that depends on `cacheTick`) wires up the
  // MobX dep so the "records" stat updates as new sweeps land.
  const recordsWritten = aetherData.cacheSize;

  // Reuse `generatedAt` from the standard index when available; otherwise
  // fall back to "now" so the field has a sane formattable value.
  const generatedAt =
    data.index.status === "ready"
      ? data.index.value.generatedAt
      : new Date().toISOString();

  const synthetic: DatasetIndex = {
    generatedAt,
    diceMin: ADV_DICE_RANGE.min,
    diceMax: ADV_DICE_RANGE.max,
    totalMin: ADV_TARGET_RANGE.min,
    totalMax: ADV_TARGET_RANGE.max,
    depower: false,
    recordsWritten,
    diceTriplesTotal: AETHER_UNIVERSE_TUPLE_COUNT,
    dice: [],
  };

  return { status: "ready", value: synthetic };
}
