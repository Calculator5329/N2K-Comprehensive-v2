import { describe, expect, it } from "vitest";
import {
  encodeShareable,
  decodeShareable,
} from "../src/services/compressedHashCodec";

/**
 * Round-trip + failure-mode coverage for the Compose plan codec.
 *
 * The codec is the on-disk contract for shareable Compose URLs (#17),
 * so every primitive shape that `CompositionStore.snapshot()` can
 * emit needs to round-trip losslessly: numbers, strings (including
 * empty), nested arrays, nested objects, and tuple-ish 2-arrays.
 *
 * The decoder MUST never throw — bad input always returns `null` so
 * a malformed permalink falls back to the default plan instead of
 * crashing the page.
 */
describe("compressedHashCodec", () => {
  it("round-trips a primitive object", async () => {
    const value = { a: 1, b: "two", c: true, d: null };
    const encoded = await encodeShareable(value);
    expect(encoded.startsWith("v1.")).toBe(true);
    const decoded = await decodeShareable<typeof value>(encoded);
    expect(decoded).toEqual(value);
  });

  it("round-trips a representative SharedPlanV1 envelope", async () => {
    const plan = {
      version: 1 as const,
      pool: "standard" as const,
      timeBudget: 60 as const,
      seed: "test-seed",
      boards: [
        {
          kind: "random" as const,
          rangeMin: 1,
          rangeMax: 200,
          multiples: [6],
          patternStart: 6,
          rounds: 4,
          overrides: [
            [0, 42],
            [17, 99],
          ] as Array<[number, number]>,
        },
        {
          kind: "pattern" as const,
          rangeMin: 1,
          rangeMax: 999,
          multiples: [3, 6, 9],
          patternStart: 3,
          rounds: 2,
          overrides: [] as Array<[number, number]>,
        },
      ],
    };
    const encoded = await encodeShareable(plan);
    const decoded = await decodeShareable<typeof plan>(encoded);
    expect(decoded).toEqual(plan);
  });

  it("returns null for malformed prefix", async () => {
    expect(await decodeShareable("v0.AAAA")).toBeNull();
    expect(await decodeShareable("garbage")).toBeNull();
    expect(await decodeShareable("")).toBeNull();
  });

  it("returns null for malformed base64", async () => {
    expect(await decodeShareable("v1.!!!not-base64!!!")).toBeNull();
  });

  it("returns null when the inner JSON is corrupted", async () => {
    // Compress non-JSON bytes, then re-package as a valid v1 envelope.
    const cs = new CompressionStream("deflate-raw");
    const writer = cs.writable.getWriter();
    void writer.write(new TextEncoder().encode("not-json-{{"));
    void writer.close();
    const reader = cs.readable.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value !== undefined) {
        chunks.push(value);
        total += value.byteLength;
      }
    }
    const compressed = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      compressed.set(c, offset);
      offset += c.byteLength;
    }
    let bin = "";
    for (let i = 0; i < compressed.length; i += 1) {
      bin += String.fromCharCode(compressed[i]!);
    }
    const b64 = btoa(bin)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    expect(await decodeShareable(`v1.${b64}`)).toBeNull();
  });

  it("compression actually shrinks repetitive payloads", async () => {
    const repetitive = { items: Array.from({ length: 200 }, () => "abcdef") };
    const encoded = await encodeShareable(repetitive);
    const naive = JSON.stringify(repetitive);
    expect(encoded.length).toBeLessThan(naive.length);
  });
});
