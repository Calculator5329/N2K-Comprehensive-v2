/**
 * Generate the advanced (Æther) `.n2k` dataset.
 *
 *   tsx scripts/export-advanced.ts [outputDir] [--arity=N] [--workers=N]
 *
 * Defaults:
 *   - outputDir: ./data-raw/n2k-aether
 *   - arities: 3, 4, 5
 *   - workers: max(1, cpus - 1)
 *
 * Sharding strategy: enumerate every unordered N-tuple in
 * `ADV_DICE_RANGE`, dispatch them across a pool of `worker_threads`
 * each running `scripts/advanced-worker.ts`, and aggregate results into
 * per-arity index + coverage files.
 *
 * This is a long-running job (hours at arity 4/5) — see
 * `docs/current_task.md` for size/time estimates.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { join, resolve } from "node:path";
import { Worker } from "node:worker_threads";

import {
  ADV_DICE_RANGE,
  ADV_TARGET_RANGE,
} from "../src/core/constants.js";
// ADV_*_RANGE used only as defaults for the optional CLI overrides above.
import {
  ArityAggregator,
  writeArityAggregates,
  writeChunkFile,
  type AdvancedTupleResult,
} from "../src/services/advancedExporter.js";
import { enumerateUnorderedTuples } from "../src/services/advancedSolver.js";
import type { Arity } from "../src/core/types.js";

// ---------------------------------------------------------------------------
//  CLI parsing
// ---------------------------------------------------------------------------

function parseFlag(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg === undefined ? undefined : arg.slice(prefix.length);
}

const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const outputDir = resolve(positional[0] ?? "./data-raw/n2k-aether");
const workerCount = Math.max(
  1,
  Number(parseFlag("workers") ?? Math.max(1, cpus().length - 1)),
);
const arityFlag = parseFlag("arity");
const arities: Arity[] = arityFlag
  ? [Number(arityFlag) as Arity]
  : [3, 4, 5];

// Optional dice/target overrides — handy for smoke tests.
const diceMin = Number(parseFlag("dice-min") ?? ADV_DICE_RANGE.min);
const diceMax = Number(parseFlag("dice-max") ?? ADV_DICE_RANGE.max);
const targetMin = Number(parseFlag("target-min") ?? ADV_TARGET_RANGE.min);
const targetMax = Number(parseFlag("target-max") ?? ADV_TARGET_RANGE.max);

await mkdir(outputDir, { recursive: true });

console.log(`> Æther export → ${outputDir}`);
console.log(
  `  dice ${diceMin}..${diceMax}, ` +
    `targets ${targetMin}..${targetMax}, ` +
    `arities=${arities.join(",")}, workers=${workerCount}`,
);

// ---------------------------------------------------------------------------
//  Worker pool helpers
// ---------------------------------------------------------------------------

interface WorkerSlot {
  readonly id: number;
  readonly worker: Worker;
  busy: boolean;
}

interface ResultMessage {
  readonly type: "result";
  readonly taskId: number;
  readonly result: AdvancedTupleResult;
}

function spawnPool(size: number): WorkerSlot[] {
  const pool: WorkerSlot[] = [];
  for (let i = 0; i < size; i += 1) {
    const worker = new Worker(
      // Bootstrap shim registers tsx's ESM loader inside the worker
      // before importing the TypeScript entry point.
      new URL("./advanced-worker-bootstrap.mjs", import.meta.url),
    );
    pool.push({ id: i, worker, busy: false });
  }
  return pool;
}

async function shutdownPool(pool: ReadonlyArray<WorkerSlot>): Promise<void> {
  await Promise.all(
    pool.map(async (slot) => {
      slot.worker.postMessage({ type: "shutdown" });
      try {
        await slot.worker.terminate();
      } catch {
        // Already exited.
      }
    }),
  );
}

// ---------------------------------------------------------------------------
//  Per-arity export driver
// ---------------------------------------------------------------------------

async function runArity(arity: Arity): Promise<void> {
  const tuples = enumerateUnorderedTuples(arity, diceMin, diceMax);
  console.log(`\n=== Arity ${arity}: ${tuples.length.toLocaleString()} tuples ===`);

  const aggregator = new ArityAggregator(arity, targetMin, targetMax);
  const pool = spawnPool(workerCount);

  const t0 = Date.now();
  let nextTupleIdx = 0;
  let completed = 0;
  let lastLogPct = -1;

  await new Promise<void>((resolveAll, rejectAll) => {
    function dispatch(slot: WorkerSlot): void {
      if (nextTupleIdx >= tuples.length) {
        slot.busy = false;
        return;
      }
      const dice = tuples[nextTupleIdx];
      nextTupleIdx += 1;
      slot.busy = true;
      slot.worker.postMessage({
        type: "job",
        taskId: nextTupleIdx,
        dice,
        arity,
        totalMin: targetMin,
        totalMax: targetMax,
      });
    }

    for (const slot of pool) {
      slot.worker.on("error", (err) => rejectAll(err));
      slot.worker.on("message", async (msg: ResultMessage) => {
        if (msg.type !== "result") return;
        const r = msg.result;
        // chunkBytes' buffer was transferred — wrap if necessary.
        const chunkBytes =
          r.chunkBytes instanceof Uint8Array
            ? r.chunkBytes
            : new Uint8Array(r.chunkBytes as ArrayBuffer);
        try {
          await writeChunkFile(outputDir, arity, r.dice, chunkBytes);
          aggregator.ingest({ ...r, chunkBytes });
        } catch (err) {
          rejectAll(err as Error);
          return;
        }

        completed += 1;
        const pct = Math.floor((completed / tuples.length) * 100);
        if (pct !== lastLogPct && (pct % 5 === 0 || completed === tuples.length)) {
          lastLogPct = pct;
          const elapsed = (Date.now() - t0) / 1000;
          const rate = completed / Math.max(elapsed, 0.001);
          const eta = (tuples.length - completed) / Math.max(rate, 1e-9);
          console.log(
            `  ${pct.toString().padStart(3, " ")}%  ` +
              `${completed}/${tuples.length}  ` +
              `${rate.toFixed(1)} tuples/s  ` +
              `elapsed ${elapsed.toFixed(0)}s  ` +
              `eta ${eta.toFixed(0)}s`,
          );
        }

        if (completed === tuples.length) {
          resolveAll();
        } else {
          dispatch(slot);
        }
      });

      dispatch(slot);
    }
  });

  await shutdownPool(pool);

  const indexFile = aggregator.buildIndexFile();
  const coverageFile = aggregator.buildCoverageFile();
  const { indexPath, coveragePath } = await writeArityAggregates(
    outputDir,
    arity,
    indexFile,
    coverageFile,
  );
  console.log(`  → ${indexPath}`);
  console.log(`  → ${coveragePath}`);
}

// ---------------------------------------------------------------------------
//  Main
// ---------------------------------------------------------------------------

const tStart = Date.now();
for (const arity of arities) {
  await runArity(arity);
}
const elapsedMs = Date.now() - tStart;

const manifest = {
  generatedAt: new Date(tStart).toISOString(),
  diceMin,
  diceMax,
  totalMin: targetMin,
  totalMax: targetMax,
  arities,
  elapsedMs,
};
await writeFile(
  join(outputDir, "manifest.json"),
  JSON.stringify(manifest, null, 2),
);

console.log(`\n> Done in ${(elapsedMs / 1000).toFixed(1)}s`);
console.log(`  manifest: ${join(outputDir, "manifest.json")}`);
