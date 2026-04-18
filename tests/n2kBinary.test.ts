import { describe, expect, it } from "vitest";
import {
  COVERAGE_NO_SOLUTION,
  MAGIC,
  VERSION,
  encodeChunk,
  encodeCoverage,
  encodeIndex,
  parseChunk,
  parseCoverage,
  parseIndex,
  type Chunk,
  type CoverageFile,
  type IndexFile,
  type Operator,
} from "../src/core/n2kBinary.js";

function bufferOf(u8: Uint8Array): ArrayBuffer {
  // Vitest in node hands back Buffers backed by larger pools; slice to
  // a fresh ArrayBuffer so the parsers see exactly what was written.
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

function hex(u8: Uint8Array): string {
  return [...u8].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("n2kBinary chunk", () => {
  it("round-trips an arity-3 chunk with edge values", () => {
    const chunk: Chunk = {
      arity: 3,
      dice: [2, 3, -5],
      records: [
        { target: 1,    difficulty: 0,   exps: [0, 0, 0],    ops: [1, 1] as Operator[] },
        { target: 5000, difficulty: 100, exps: [20, 13, 9],  ops: [4, 3] as Operator[] },
        { target: 999,  difficulty: 42.27, exps: [5, 2, 2],  ops: [1, 1] as Operator[] },
      ],
    };
    const encoded = encodeChunk(chunk);
    const decoded = parseChunk(bufferOf(encoded));
    expect(decoded).toEqual(chunk);
  });

  it("round-trips arity 4 and 5", () => {
    const a4: Chunk = {
      arity: 4,
      dice: [-10, 0, 7, 32],
      records: [
        { target: 100, difficulty: 17.5, exps: [3, 1, 4, 2], ops: [1, 3, 2] as Operator[] },
        { target: 4000, difficulty: 88.88, exps: [0, 1, 0, 5], ops: [4, 4, 4] as Operator[] },
      ],
    };
    const a5: Chunk = {
      arity: 5,
      dice: [1, -1, 2, 3, 4],
      records: [
        { target: 50, difficulty: 12.34, exps: [1, 0, 6, 4, 2], ops: [1, 2, 3, 4] as Operator[] },
      ],
    };
    expect(parseChunk(bufferOf(encodeChunk(a4)))).toEqual(a4);
    expect(parseChunk(bufferOf(encodeChunk(a5)))).toEqual(a5);
  });

  it("matches a hand-computed byte snapshot (arity 3)", () => {
    // Byte-for-byte regression test. If any field ordering, bit packing,
    // or sentinel changes, this assertion fires.
    const chunk: Chunk = {
      arity: 3,
      dice: [2, 3, -5],
      records: [
        { target: 1,    difficulty: 0,   exps: [0, 0, 0],   ops: [1, 1] as Operator[] },
        { target: 8191, difficulty: 100, exps: [20, 13, 9], ops: [4, 3] as Operator[] },
      ],
    };
    const encoded = encodeChunk(chunk);
    const expected =
      "4e324b58" + // magic "N2KX"
      "0101" +     // version=1, kind=1 (chunk)
      "0000" +     // reserved
      "03" +       // arity
      "06" +       // record_size
      "0200" +     // record_count = 2 LE
      "0203fb" +   // dice [2, 3, -5 (=0xFB)]
      "010000000000" + // record 0
      "ff1fe2a42d2d";  // record 1
    expect(hex(encoded)).toBe(expected);
  });

  it("clamps difficulty above 100 to 100.00 on encode", () => {
    const chunk: Chunk = {
      arity: 3,
      dice: [2, 2, 2],
      records: [{ target: 1, difficulty: 250, exps: [0, 0, 0], ops: [1, 1] as Operator[] }],
    };
    const decoded = parseChunk(bufferOf(encodeChunk(chunk)));
    expect(decoded.records[0]!.difficulty).toBe(100);
  });

  it("preserves negative dice values via int8 round-trip", () => {
    const chunk: Chunk = {
      arity: 5,
      dice: [-10, -1, 0, 16, 32],
      records: [],
    };
    expect(parseChunk(bufferOf(encodeChunk(chunk))).dice).toEqual([-10, -1, 0, 16, 32]);
  });

  it("rejects out-of-range record fields on encode", () => {
    expect(() =>
      encodeChunk({
        arity: 3, dice: [2, 3, 5],
        records: [{ target: 8192, difficulty: 0, exps: [0, 0, 0], ops: [1, 1] as Operator[] }],
      }),
    ).toThrow(/13-bit/);
    expect(() =>
      encodeChunk({
        arity: 3, dice: [2, 3, 5],
        records: [{ target: 1, difficulty: 0, exps: [0, 0, 32], ops: [1, 1] as Operator[] }],
      }),
    ).toThrow(/5-bit/);
    expect(() =>
      encodeChunk({
        arity: 3, dice: [2, 3, 5],
        records: [{ target: 1, difficulty: 0, exps: [0, 0, 0], ops: [5, 1] as unknown as Operator[] }],
      }),
    ).toThrow(/operator/);
  });
});

describe("n2kBinary index", () => {
  it("round-trips per-arity tuple summaries", () => {
    const idx: IndexFile = {
      arity: 4,
      rows: [
        {
          dice: [-3, 2, 5, 7],
          solvableCount: 1234,
          impossibleCount: 766,
          minDifficulty: 1.23,
          maxDifficulty: 99.99,
          averageDifficulty: 42.5678,
        },
        {
          dice: [0, 0, 1, 1],
          solvableCount: 0,
          impossibleCount: 2000,
          minDifficulty: 0,
          maxDifficulty: 0,
          averageDifficulty: 0,
        },
      ],
    };
    const decoded = parseIndex(bufferOf(encodeIndex(idx)));
    expect(decoded.arity).toBe(4);
    expect(decoded.rows).toHaveLength(2);
    expect(decoded.rows[0]!.dice).toEqual([-3, 2, 5, 7]);
    expect(decoded.rows[0]!.averageDifficulty).toBeCloseTo(42.5678, 4);
  });
});

describe("n2kBinary coverage", () => {
  it("round-trips per-target aggregates with sentinel for unsolvable", () => {
    const cov: CoverageFile = {
      arity: 3,
      rows: [
        { target: 1, minDifficulty: 5,    maxDifficulty: 17,   solvableTuples: 200 },
        { target: 2, minDifficulty: null, maxDifficulty: null, solvableTuples: 0 },
        { target: 3, minDifficulty: 100,  maxDifficulty: 100,  solvableTuples: 1 },
      ],
    };
    const decoded = parseCoverage(bufferOf(encodeCoverage(cov)));
    expect(decoded).toEqual(cov);
  });

  it("uses the documented 0xFFFF sentinel for unsolvable targets", () => {
    const cov: CoverageFile = {
      arity: 3,
      rows: [{ target: 1, minDifficulty: null, maxDifficulty: null, solvableTuples: 0 }],
    };
    const encoded = encodeCoverage(cov);
    const view = new DataView(bufferOf(encoded));
    expect(view.getUint16(16, true)).toBe(COVERAGE_NO_SOLUTION);
    expect(view.getUint16(18, true)).toBe(COVERAGE_NO_SOLUTION);
  });

  it("rejects out-of-order rows on encode", () => {
    expect(() =>
      encodeCoverage({
        arity: 3,
        rows: [{ target: 2, minDifficulty: 0, maxDifficulty: 0, solvableTuples: 0 }],
      }),
    ).toThrow(/target=2 at row 0/);
  });
});

describe("n2kBinary header validation", () => {
  it("rejects bad magic", () => {
    const buf = new Uint8Array([0xff, 0xff, 0xff, 0xff, 1, 1, 0, 0, 3, 6, 0, 0, 2, 3, 5]);
    expect(() => parseChunk(bufferOf(buf))).toThrow(/bad magic/);
  });

  it("rejects unsupported version", () => {
    const buf = encodeChunk({ arity: 3, dice: [2, 3, 5], records: [] });
    buf[4] = (VERSION + 1) & 0xff;
    expect(() => parseChunk(bufferOf(buf))).toThrow(/unsupported format version/);
  });

  it("rejects mismatched file kind", () => {
    const idx = encodeIndex({ arity: 3, rows: [] });
    expect(() => parseChunk(bufferOf(idx))).toThrow(/file kind mismatch/);
  });

  it("rejects truncated headers", () => {
    expect(() => parseChunk(bufferOf(new Uint8Array([1, 2, 3])))).toThrow(/too small/);
  });
});

describe("n2kBinary constants", () => {
  it("MAGIC is little-endian ASCII 'N2KX'", () => {
    const view = new DataView(new ArrayBuffer(4));
    view.setUint32(0, MAGIC, true);
    expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)))
      .toBe("N2KX");
  });
});
