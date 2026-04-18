import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  enumerateUnorderedTriples,
  exportAllSolutions,
  type ExportManifest,
} from "../src/services/exporter.js";

describe("enumerateUnorderedTriples", () => {
  it("produces C(n+2, 3) sorted triples", () => {
    const triples = enumerateUnorderedTriples(1, 4);
    // C(4+2, 3) = 20
    expect(triples).toHaveLength(20);
    // Each triple is non-decreasing.
    for (const t of triples) {
      expect(t[0]).toBeLessThanOrEqual(t[1]);
      expect(t[1]).toBeLessThanOrEqual(t[2]);
    }
    // No duplicates.
    const keys = new Set(triples.map((t) => t.join(",")));
    expect(keys.size).toBe(triples.length);
  });

  it("matches the documented count of 1540 for dice 1..20", () => {
    expect(enumerateUnorderedTriples(1, 20)).toHaveLength(1540);
  });

  it("rejects inverted ranges", () => {
    expect(() => enumerateUnorderedTriples(5, 3)).toThrow(RangeError);
  });
});

describe("exportAllSolutions", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "n2k-export-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("writes one NDJSON record per solvable (dice, total) cell", async () => {
    const outputPath = join(tmpDir, "out.ndjson");
    const result = await exportAllSolutions(outputPath, {
      diceMin: 2,
      diceMax: 3,
      totalMin: 1,
      totalMax: 20,
      depower: false,
    });

    const contents = await readFile(outputPath, "utf8");
    const lines = contents.trim().split("\n");
    expect(lines.length).toBe(result.manifest.recordsWritten);
    expect(lines.length).toBeGreaterThan(0);

    // Every line is valid JSON with the expected shape.
    for (const line of lines) {
      const record = JSON.parse(line) as {
        dice: number[];
        total: number;
        difficulty: number;
        equation: string;
      };
      expect(record.dice).toHaveLength(3);
      expect(Number.isInteger(record.total)).toBe(true);
      expect(record.total).toBeGreaterThanOrEqual(1);
      expect(record.total).toBeLessThanOrEqual(20);
      expect(record.equation).toMatch(/= \d+$/);
      expect(typeof record.difficulty).toBe("number");
    }
  });

  it("writes a manifest sidecar with per-dice stats", async () => {
    const outputPath = join(tmpDir, "out.ndjson");
    const result = await exportAllSolutions(outputPath, {
      diceMin: 2,
      diceMax: 3,
      totalMin: 1,
      totalMax: 20,
      depower: false,
    });

    expect(result.manifestPath).toBe(join(tmpDir, "out.manifest.json"));
    const manifest = JSON.parse(
      await readFile(result.manifestPath, "utf8"),
    ) as ExportManifest;

    expect(manifest.diceMin).toBe(2);
    expect(manifest.diceMax).toBe(3);
    expect(manifest.totalMin).toBe(1);
    expect(manifest.totalMax).toBe(20);
    expect(manifest.depower).toBe(false);
    expect(manifest.diceTriplesTotal).toBe(manifest.perDice.length);

    for (const row of manifest.perDice) {
      expect(row.dice).toHaveLength(3);
      expect(row.solvableCount + row.impossibleCount).toBe(20);
      if (row.solvableCount > 0) {
        expect(row.minDifficulty).not.toBeNull();
        expect(row.maxDifficulty).not.toBeNull();
        expect(row.averageDifficulty).not.toBeNull();
      }
    }
  });

  it("invokes onProgress once per dice triple", async () => {
    const outputPath = join(tmpDir, "out.ndjson");
    const calls: number[] = [];
    await exportAllSolutions(outputPath, {
      diceMin: 2,
      diceMax: 3,
      totalMin: 1,
      totalMax: 5,
      onProgress: ({ done, total }) => {
        calls.push(done);
        expect(total).toBe(4); // C(2+2, 3) = 4
      },
    });
    expect(calls).toEqual([1, 2, 3, 4]);
  });
});
