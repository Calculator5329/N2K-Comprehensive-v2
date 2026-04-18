/**
 * Standalone post-processor that walks every per-dice JSON chunk in
 * `web/public/data/dice/` and emits `web/public/data/difficulty.json`,
 * a flat (dice -> [difficulty | null] × N) matrix used by the Compose
 * feature.
 *
 * Why bundle this: Compose's expected-score heuristic only needs
 * `(dice, target) -> difficulty`; it never reads equation strings.
 * Surfacing those numbers as one packed file lets the web app prefetch
 * any candidate pool in a single HTTP request rather than pulling
 * ~1,500 lazy chunks (the previous "Extensive" pool flow).
 *
 * Why a separate script: same rationale as `compute-target-stats.ts` —
 * the canonical `prepare-web-data.ts` pipeline needs the source NDJSON,
 * but the chunked JSON artifacts are already in the repo. This script
 * lets us augment the dataset without regenerating it from scratch.
 * `prepare-web-data.ts` emits the same file in lockstep.
 *
 *   tsx scripts/compute-difficulty-matrix.ts \
 *       [outputDir=./web/public/data]
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputDir = resolve(process.argv[2] ?? "./web/public/data");
const diceDir = `${outputDir}/dice`;
const outPath = `${outputDir}/difficulty.json`;

interface DiceFile {
  dice: [number, number, number];
  solutions: Record<string, { difficulty: number; equation: string }>;
}

interface IndexFile {
  totalMin: number;
  totalMax: number;
}

console.log(`> Reading index.json`);
const indexPayload = JSON.parse(
  await readFile(`${outputDir}/index.json`, "utf8"),
) as IndexFile;
const totalMin = indexPayload.totalMin;
const totalMax = indexPayload.totalMax;
const span = totalMax - totalMin + 1;

console.log(`> Reading dice chunks from: ${diceDir}`);
const entries = await readdir(diceDir);
const dice: Record<string, (number | null)[]> = Object.create(null);

let read = 0;
let solvableCells = 0;
for (const name of entries) {
  if (!name.endsWith(".json")) continue;
  const payload = JSON.parse(
    await readFile(`${diceDir}/${name}`, "utf8"),
  ) as DiceFile;
  const row: (number | null)[] = new Array(span).fill(null);
  for (const [totalRaw, sol] of Object.entries(payload.solutions)) {
    const idx = Number(totalRaw) - totalMin;
    if (idx < 0 || idx >= span) continue;
    row[idx] = sol.difficulty;
    solvableCells += 1;
  }
  dice[payload.dice.join("-")] = row;
  read += 1;
  if (read % 200 === 0) {
    process.stdout.write(`  read ${read}/${entries.length}\n`);
  }
}
console.log(`  read ${read}/${entries.length}`);

console.log(`> Writing ${outPath}`);
const json = JSON.stringify({ totalMin, totalMax, dice });
await writeFile(outPath, json, "utf8");

const triples = Object.keys(dice).length;
const sizeMb = (json.length / 1024 / 1024).toFixed(2);
console.log(
  `  ${triples} dice × ${span} targets, ${solvableCells.toLocaleString()} solvable cells, ${sizeMb} MB raw`,
);
console.log("> Done.");
