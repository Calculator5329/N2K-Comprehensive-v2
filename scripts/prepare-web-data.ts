/**
 * Convert the bulk NDJSON export into the chunked JSON format the web app
 * consumes from `web/public/data/`:
 *
 *   index.json                         { meta, dice: [...summary rows] }
 *   by-target.json                     { [total]: { dice, difficulty, equation } | null }
 *   target-stats.json                  { [total]: { easiest, hardest, solverCount } }
 *   difficulty.json                    { totalMin, totalMax, dice: { "a-b-c": [d|null × N] } }
 *   dice/{a}-{b}-{c}.json              { dice, solutions: { [total]: { difficulty, equation } } }
 *
 * The split keeps initial page load tiny (~150 KB) while letting users drill
 * into any dice triple with a single ~5 KB lazy fetch.
 *
 * `difficulty.json` is the equation-stripped flat view used by the Compose
 * feature: one fetch instead of 1,501 (`Extensive` pool), since the
 * competition generator only needs `(dice, target) -> difficulty` and never
 * touches equation strings. Roughly 7 MB raw / 880 KB gzip / 540 KB brotli.
 *
 *   tsx scripts/prepare-web-data.ts \
 *       [inputNdjson=./data-raw/n2k-export.ndjson] \
 *       [outputDir=./web/public/data]
 */
import { createReadStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline";

const inputPath = resolve(process.argv[2] ?? "./data-raw/n2k-export.ndjson");
const outputDir = resolve(process.argv[3] ?? "./web/public/data");

const manifestPath = inputPath.endsWith(".ndjson")
  ? inputPath.replace(/\.ndjson$/, ".manifest.json")
  : `${inputPath}.manifest.json`;

interface Record {
  dice: [number, number, number];
  total: number;
  difficulty: number;
  equation: string;
}

interface PerDiceSummary {
  dice: [number, number, number];
  solvableCount: number;
  impossibleCount: number;
  minDifficulty: number | null;
  maxDifficulty: number | null;
  averageDifficulty: number | null;
}

interface Manifest {
  generatedAt: string;
  diceMin: number;
  diceMax: number;
  diceTriplesTotal: number;
  totalMin: number;
  totalMax: number;
  depower: boolean;
  recordsWritten: number;
  elapsedMs: number;
  perDice: PerDiceSummary[];
}

console.log(`> Reading manifest:  ${manifestPath}`);
const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Manifest;

console.log(`> Reading NDJSON:    ${inputPath}`);
console.log(`> Writing chunks to: ${outputDir}`);

await mkdir(`${outputDir}/dice`, { recursive: true });

// Stream-read NDJSON, group by dice triple in memory. Total dataset is
// ~30 MB so memory is fine; we just need the per-dice grouping to write
// each chunk file once.
const grouped = new Map<string, Record[]>();
const byTarget = new Map<number, Record>();
// Per-target rollups for the Visualize "Coverage gaps" + "Hardest
// reachable" overlays. We track the globally hardest equation per
// target alongside the easiest, plus the count of distinct triples
// that solve the target (= "fragility" — low counts mean the target
// can only be reached by a handful of dice).
interface TargetStats {
  easiest: Record | null;
  hardest: Record | null;
  solverCount: number;
}
const targetStats = new Map<number, TargetStats>();

const rl = createInterface({
  input: createReadStream(inputPath, { encoding: "utf8" }),
  crlfDelay: Infinity,
});

let lineCount = 0;
for await (const line of rl) {
  if (line.length === 0) continue;
  const record = JSON.parse(line) as Record;

  const key = record.dice.join("-");
  let bucket = grouped.get(key);
  if (bucket === undefined) {
    bucket = [];
    grouped.set(key, bucket);
  }
  bucket.push(record);

  // For the by-target index we keep only the globally easiest dice/equation
  // for each total. Useful for "what dice should I pick to hit X?" lookups.
  const current = byTarget.get(record.total);
  if (current === undefined || record.difficulty < current.difficulty) {
    byTarget.set(record.total, record);
  }

  // Per-target stats: track easiest, hardest, and count.
  let stats = targetStats.get(record.total);
  if (stats === undefined) {
    stats = { easiest: null, hardest: null, solverCount: 0 };
    targetStats.set(record.total, stats);
  }
  stats.solverCount += 1;
  if (stats.easiest === null || record.difficulty < stats.easiest.difficulty) {
    stats.easiest = record;
  }
  if (stats.hardest === null || record.difficulty > stats.hardest.difficulty) {
    stats.hardest = record;
  }

  lineCount += 1;
  if (lineCount % 50_000 === 0) {
    process.stdout.write(`  read ${lineCount.toLocaleString()} lines...\n`);
  }
}
console.log(`  read ${lineCount.toLocaleString()} lines total`);

// Write per-dice chunk files.
console.log(`> Writing ${grouped.size} per-dice chunk files`);
let chunkCount = 0;
for (const summary of manifest.perDice) {
  const key = summary.dice.join("-");
  const records = grouped.get(key) ?? [];
  const solutions: Record<string, { difficulty: number; equation: string }> =
    Object.create(null);
  for (const r of records) {
    solutions[String(r.total)] = { difficulty: r.difficulty, equation: r.equation };
  }
  const payload = {
    dice: summary.dice,
    summary: {
      solvableCount: summary.solvableCount,
      impossibleCount: summary.impossibleCount,
      minDifficulty: summary.minDifficulty,
      maxDifficulty: summary.maxDifficulty,
      averageDifficulty: summary.averageDifficulty,
    },
    solutions,
  };
  await writeFile(
    `${outputDir}/dice/${key}.json`,
    JSON.stringify(payload),
    "utf8",
  );
  chunkCount += 1;
  if (chunkCount % 200 === 0) {
    process.stdout.write(`  wrote ${chunkCount}/${grouped.size}\n`);
  }
}
console.log(`  wrote ${chunkCount}/${grouped.size}`);

// Write top-level index.json (small — ships with initial page load).
console.log(`> Writing index.json`);
const indexPayload = {
  generatedAt: manifest.generatedAt,
  diceMin: manifest.diceMin,
  diceMax: manifest.diceMax,
  totalMin: manifest.totalMin,
  totalMax: manifest.totalMax,
  depower: manifest.depower,
  recordsWritten: manifest.recordsWritten,
  diceTriplesTotal: manifest.diceTriplesTotal,
  dice: manifest.perDice,
};
await writeFile(`${outputDir}/index.json`, JSON.stringify(indexPayload), "utf8");

// Write by-target.json (one row per target with its globally easiest equation).
console.log(`> Writing by-target.json`);
const byTargetPayload: Record<
  string,
  { dice: [number, number, number]; difficulty: number; equation: string } | null
> = Object.create(null);
for (let t = manifest.totalMin; t <= manifest.totalMax; t += 1) {
  const r = byTarget.get(t);
  byTargetPayload[String(t)] = r
    ? { dice: r.dice, difficulty: r.difficulty, equation: r.equation }
    : null;
}
await writeFile(`${outputDir}/by-target.json`, JSON.stringify(byTargetPayload), "utf8");

// Write target-stats.json (per-target rollup with hardest + solver count).
console.log(`> Writing target-stats.json`);
const targetStatsPayload: Record<
  string,
  {
    easiest: { dice: [number, number, number]; difficulty: number; equation: string } | null;
    hardest: { dice: [number, number, number]; difficulty: number; equation: string } | null;
    solverCount: number;
  }
> = Object.create(null);
for (let t = manifest.totalMin; t <= manifest.totalMax; t += 1) {
  const s = targetStats.get(t);
  targetStatsPayload[String(t)] = {
    easiest: s?.easiest
      ? { dice: s.easiest.dice, difficulty: s.easiest.difficulty, equation: s.easiest.equation }
      : null,
    hardest: s?.hardest
      ? { dice: s.hardest.dice, difficulty: s.hardest.difficulty, equation: s.hardest.equation }
      : null,
    solverCount: s?.solverCount ?? 0,
  };
}
await writeFile(
  `${outputDir}/target-stats.json`,
  JSON.stringify(targetStatsPayload),
  "utf8",
);

// Write difficulty.json (compact (dice -> [difficulty | null] × N) matrix).
//
// Compose's expected-score heuristic only needs difficulty per (dice, target)
// — never the equation string. Bundling those into one file lets the web
// app prefetch the entire candidate-pool with a single HTTP request rather
// than ~1,500 lazy chunks. See `web/src/services/difficultyMatrixService.ts`.
console.log(`> Writing difficulty.json`);
const totalMin = manifest.totalMin;
const totalMax = manifest.totalMax;
const span = totalMax - totalMin + 1;
const diceMatrix: Record<string, (number | null)[]> = Object.create(null);
for (const summary of manifest.perDice) {
  const key = summary.dice.join("-");
  const records = grouped.get(key) ?? [];
  const row: (number | null)[] = new Array(span).fill(null);
  for (const r of records) {
    const idx = r.total - totalMin;
    if (idx >= 0 && idx < span) row[idx] = r.difficulty;
  }
  diceMatrix[key] = row;
}
await writeFile(
  `${outputDir}/difficulty.json`,
  JSON.stringify({ totalMin, totalMax, dice: diceMatrix }),
  "utf8",
);

console.log("> Done.");
