/**
 * Standalone post-processor that walks every per-dice JSON chunk in
 * `web/public/data/dice/` and emits `web/public/data/target-stats.json`,
 * a per-target roll-up containing:
 *
 *   - the globally easiest dice/equation/difficulty for that target
 *     (mirrors the existing `by-target.json`),
 *   - the globally HARDEST dice/equation/difficulty for that target
 *     (the new bit, used by the Visualize "Hardest reachable" overlay),
 *   - the count of distinct dice triples that can solve that target
 *     (used by the "Coverage gaps" section to show fragility).
 *
 * Why a separate script: the canonical `prepare-web-data.ts` pipeline
 * needs the source NDJSON to run, but the chunked JSON artifacts are
 * already in the repo. This script lets us augment the dataset without
 * regenerating it from scratch. `prepare-web-data.ts` is updated in
 * lockstep so the next full export emits `target-stats.json` directly.
 *
 *   tsx scripts/compute-target-stats.ts \
 *       [outputDir=./web/public/data]
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputDir = resolve(process.argv[2] ?? "./web/public/data");
const diceDir = `${outputDir}/dice`;
const outPath = `${outputDir}/target-stats.json`;

interface DiceFile {
  dice: [number, number, number];
  solutions: Record<string, { difficulty: number; equation: string }>;
}

interface TargetEntry {
  dice: [number, number, number];
  difficulty: number;
  equation: string;
}

interface TargetStats {
  easiest: TargetEntry | null;
  hardest: TargetEntry | null;
  solverCount: number;
}

const stats = new Map<number, TargetStats>();

console.log(`> Reading dice chunks from: ${diceDir}`);
const entries = await readdir(diceDir);
let read = 0;
for (const name of entries) {
  if (!name.endsWith(".json")) continue;
  const payload = JSON.parse(
    await readFile(`${diceDir}/${name}`, "utf8"),
  ) as DiceFile;
  for (const [totalRaw, sol] of Object.entries(payload.solutions)) {
    const total = Number(totalRaw);
    let cur = stats.get(total);
    if (cur === undefined) {
      cur = { easiest: null, hardest: null, solverCount: 0 };
      stats.set(total, cur);
    }
    cur.solverCount += 1;
    const candidate: TargetEntry = {
      dice: payload.dice,
      difficulty: sol.difficulty,
      equation: sol.equation,
    };
    if (cur.easiest === null || sol.difficulty < cur.easiest.difficulty) {
      cur.easiest = candidate;
    }
    if (cur.hardest === null || sol.difficulty > cur.hardest.difficulty) {
      cur.hardest = candidate;
    }
  }
  read += 1;
  if (read % 200 === 0) {
    process.stdout.write(`  read ${read}/${entries.length}\n`);
  }
}
console.log(`  read ${read}/${entries.length}`);

// Determine the target range from existing index.json so we emit a
// dense map that includes "no solver" entries for unreachable totals.
const indexPayload = JSON.parse(
  await readFile(`${outputDir}/index.json`, "utf8"),
) as { totalMin: number; totalMax: number };

const out: Record<string, TargetStats> = Object.create(null);
for (let t = indexPayload.totalMin; t <= indexPayload.totalMax; t += 1) {
  out[String(t)] = stats.get(t) ?? {
    easiest: null,
    hardest: null,
    solverCount: 0,
  };
}

console.log(`> Writing ${outPath}`);
await writeFile(outPath, JSON.stringify(out), "utf8");

const reachable = Object.values(out).filter((s) => s.solverCount > 0).length;
const span = indexPayload.totalMax - indexPayload.totalMin + 1;
console.log(
  `  ${reachable}/${span} targets reachable; ${span - reachable} unreachable`,
);
console.log("> Done.");
