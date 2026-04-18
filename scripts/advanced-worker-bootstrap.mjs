/**
 * Worker bootstrap: registers tsx's `--import`-style ESM hook inside the
 * worker thread, then dynamically imports the real TypeScript worker
 * entry. Spawning a `.ts` worker directly with `execArgv: ['--import',
 * 'tsx']` did not consistently activate the loader for nested module
 * resolution on Node 22 + tsx 4; this shim sidesteps that by using
 * tsx's documented `register()` API before the dynamic import.
 */
import { register } from "tsx/esm/api";

register();

await import("./advanced-worker.ts");
