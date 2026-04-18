/**
 * Generate the full N2K solution dataset as NDJSON + manifest.
 *
 *   tsx scripts/export-dataset.ts [outputPath]
 *
 * Defaults to ./data-raw/n2k-export.ndjson. Used by `npm run data:all` to
 * feed the web data pipeline.
 */
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { exportAllSolutions } from "../src/services/exporter.js";

const outputPath = resolve(process.argv[2] ?? "./data-raw/n2k-export.ndjson");
await mkdir(dirname(outputPath), { recursive: true });

console.log(`> Exporting full dataset to ${outputPath}`);
const start = Date.now();

const result = await exportAllSolutions(outputPath, {
  diceMin: 1,
  diceMax: 20,
  totalMin: 1,
  totalMax: 999,
  depower: false,
  onProgress: ({ done, total }) => {
    if (done % 100 === 0 || done === total) {
      const pct = ((done / total) * 100).toFixed(0).padStart(3, " ");
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      process.stdout.write(`  ${pct}%  (${done}/${total})  ${elapsed}s\n`);
    }
  },
});

const m = result.manifest;
console.log(
  `\n> Done in ${(m.elapsedMs / 1000).toFixed(1)}s ` +
    `\u2014 ${m.recordsWritten.toLocaleString()} records across ` +
    `${m.diceTriplesTotal.toLocaleString()} dice triples`,
);
console.log(`  data:     ${result.outputPath}`);
console.log(`  manifest: ${result.manifestPath}`);
