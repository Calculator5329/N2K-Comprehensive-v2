/**
 * Glue layer between the pure `@solver/services/competition` algorithms and
 * the web app's static dataset (per-dice JSON chunks served from
 * `/data/dice/{a-b-c}.json`).
 *
 * Two responsibilities:
 *   1. Make sure every candidate dice chunk is loaded before generation.
 *   2. Adapt `DataStore.diceState` into a synchronous `DifficultyResolver`.
 */
import type { DiceTriple } from "../core/types";
import { DataStore } from "../stores/DataStore";
import type { DifficultyResolver } from "@solver/services/competition.js";

function diceKey(dice: DiceTriple): string {
  return `${dice[0]}-${dice[1]}-${dice[2]}`;
}

/**
 * Build a synchronous resolver backed by `dataStore`'s in-memory cache.
 *
 * Returns `null` for any (dice, target) where the dice chunk hasn't been
 * loaded yet OR the target is absent (== unsolvable). Callers should
 * `await ensureCandidatesLoaded(...)` before generating.
 */
export function makeDataStoreResolver(dataStore: DataStore): DifficultyResolver {
  return (dice, target) => {
    const state = dataStore.diceState(dice);
    if (state.status !== "ready") return null;
    const sol = state.value.solutions[String(target)];
    if (sol === undefined) return null;
    return sol.difficulty;
  };
}

/**
 * Ensure every dice chunk in `candidates` is present in the data store.
 * Resolves once they're all loaded (or rejects on the first network error).
 *
 * `dataStore.ensureDice` already dedupes concurrent fetches and caches the
 * result; we just trigger it for every candidate then poll until everything
 * settles. Concurrency is bounded by browser-level fetch limits, not us.
 */
export async function ensureCandidatesLoaded(
  dataStore: DataStore,
  candidates: readonly DiceTriple[],
  options: { onProgress?: (loaded: number, total: number) => void } = {},
): Promise<void> {
  const total = candidates.length;
  for (const dice of candidates) {
    dataStore.ensureDice(dice);
  }
  options.onProgress?.(countReady(dataStore, candidates), total);

  const TIMEOUT_MS = 60_000;
  const start = Date.now();
  while (true) {
    let allReady = true;
    for (const dice of candidates) {
      const state = dataStore.diceState(dice);
      if (state.status === "error") {
        throw new Error(
          `Dice ${diceKey(dice)} failed to load: ${state.error}`,
        );
      }
      if (state.status !== "ready") {
        allReady = false;
        break;
      }
    }
    if (allReady) {
      options.onProgress?.(total, total);
      return;
    }
    if (Date.now() - start > TIMEOUT_MS) {
      throw new Error("Timed out waiting for dice chunks to load");
    }
    await new Promise((r) => setTimeout(r, 30));
    options.onProgress?.(countReady(dataStore, candidates), total);
  }
}

function countReady(
  dataStore: DataStore,
  candidates: readonly DiceTriple[],
): number {
  let n = 0;
  for (const dice of candidates) {
    if (dataStore.diceState(dice).status === "ready") n += 1;
  }
  return n;
}
