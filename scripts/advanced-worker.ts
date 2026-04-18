/**
 * Worker thread used by `scripts/export-advanced.ts`.
 *
 * Receives one tuple-solve job at a time, runs it synchronously, and
 * posts back the encoded chunk + index/coverage contributions. The
 * underlying ArrayBuffer is transferred (not copied) so the parent gets
 * the bytes without a memcpy.
 */
import { isMainThread, parentPort } from "node:worker_threads";
import { exportTupleAdvanced } from "../src/services/advancedExporter.js";
import type { Arity } from "../src/core/types.js";

if (isMainThread || parentPort === null) {
  throw new Error("advanced-worker.ts must run inside a Worker thread.");
}

interface JobMessage {
  readonly type: "job";
  readonly taskId: number;
  readonly dice: readonly number[];
  readonly arity: Arity;
  readonly totalMin: number;
  readonly totalMax: number;
}

interface ShutdownMessage {
  readonly type: "shutdown";
}

type WorkerInbound = JobMessage | ShutdownMessage;

parentPort.on("message", (raw: WorkerInbound) => {
  if (raw.type === "shutdown") {
    process.exit(0);
  }
  if (raw.type !== "job") return;

  const result = exportTupleAdvanced(
    raw.dice,
    raw.arity,
    raw.totalMin,
    raw.totalMax,
  );
  // Transfer the chunk bytes' underlying ArrayBuffer so the parent
  // adopts ownership without a copy. The result wrapper is structure-cloned.
  parentPort!.postMessage(
    { type: "result", taskId: raw.taskId, result },
    [result.chunkBytes.buffer],
  );
});
