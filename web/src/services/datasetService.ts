import type {
  ByTargetEntry,
  DatasetIndex,
  DiceDetail,
  DiceTriple,
  TargetStatsEntry,
} from "../core/types";

/**
 * Stateless data-loading service. Knows where the JSON files live and how
 * to fetch them. No caching here — that's the store's job.
 */

const BASE_PATH = "/data";

function diceKey(dice: DiceTriple): string {
  return `${dice[0]}-${dice[1]}-${dice[2]}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export const datasetService = {
  loadIndex(): Promise<DatasetIndex> {
    return fetchJson<DatasetIndex>(`${BASE_PATH}/index.json`);
  },

  loadDice(dice: DiceTriple): Promise<DiceDetail> {
    return fetchJson<DiceDetail>(`${BASE_PATH}/dice/${diceKey(dice)}.json`);
  },

  loadByTarget(): Promise<Readonly<Record<string, ByTargetEntry | null>>> {
    return fetchJson(`${BASE_PATH}/by-target.json`);
  },

  loadTargetStats(): Promise<Readonly<Record<string, TargetStatsEntry>>> {
    return fetchJson(`${BASE_PATH}/target-stats.json`);
  },
};
