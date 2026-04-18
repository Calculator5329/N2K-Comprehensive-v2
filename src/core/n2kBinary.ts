/**
 * `.n2k` binary container format — used by Advanced Mode (the secret
 * Æther edition) for both the bulk-export output and the static web
 * dataset.
 *
 * Three file kinds share a universal 8-byte header:
 *
 *   - "chunk"    — one file per dice tuple, holds every solvable cell.
 *   - "index"    — per-arity tuple summary, eager-loaded.
 *   - "coverage" — per-target aggregate (min/max diff, solvable count).
 *
 * Wire details, sentinel values, and bit layouts are documented per
 * section below. The format is tested end-to-end (encode → decode round
 * trip + a hand-built byte-snapshot) so any wire-incompatible change
 * trips the test suite.
 */

/** Magic value: ASCII "N2KX", read as little-endian uint32. */
export const MAGIC = 0x584b324e;

/** Current format version. Bumped on any wire-incompatible change. */
export const VERSION = 1;

/** Operator codes mirror `OP` in `core/constants.ts` (1=+, 2=-, 3=*, 4=/). */
export type Operator = 1 | 2 | 3 | 4;

/** Numeric file-kind tag stored at byte 5 of the universal header. */
export const FILE_KIND = {
  chunk: 1,
  index: 2,
  coverage: 3,
} as const;

export type FileKind = keyof typeof FILE_KIND;

/** Sentinel difficulty value used in the coverage file when no tuple solves a target. */
export const COVERAGE_NO_SOLUTION = 0xffff;

// ---------------------------------------------------------------------------
//  Public types
// ---------------------------------------------------------------------------

/** One row in a chunk file: the easiest equation hitting `target`. */
export interface ChunkRecord {
  readonly target: number;
  /** Difficulty in 0..100 with 2 decimal precision (round-tripped via × 100). */
  readonly difficulty: number;
  /** One exponent per dice; length == arity. */
  readonly exps: readonly number[];
  /** Operator codes between consecutive dice; length == arity − 1. */
  readonly ops: readonly Operator[];
}

/** All solvable cells for one dice tuple, sorted by target ascending. */
export interface Chunk {
  readonly arity: number;
  readonly dice: readonly number[];
  readonly records: readonly ChunkRecord[];
}

/** Per-tuple summary row in an index file. */
export interface IndexRow {
  readonly dice: readonly number[];
  readonly solvableCount: number;
  readonly impossibleCount: number;
  readonly minDifficulty: number;
  readonly maxDifficulty: number;
  /** 4-decimal precision (round-tripped via × 10_000). */
  readonly averageDifficulty: number;
}

/** All tuple summaries for one arity. */
export interface IndexFile {
  readonly arity: number;
  readonly rows: readonly IndexRow[];
}

/** Per-target aggregate row in a coverage file. */
export interface CoverageRow {
  readonly target: number;
  /** `null` when no tuple in the dataset solves this target. */
  readonly minDifficulty: number | null;
  readonly maxDifficulty: number | null;
  readonly solvableTuples: number;
}

/** All per-target aggregates for one arity. */
export interface CoverageFile {
  readonly arity: number;
  readonly rows: readonly CoverageRow[];
}

// ---------------------------------------------------------------------------
//  Internal helpers
// ---------------------------------------------------------------------------

/**
 * Tiny LSB-first bit reader. Reads up to 32 bits at a time from a fixed
 * `DataView` window, tracking its own bit cursor relative to a starting
 * byte offset. Crosses byte boundaries transparently.
 *
 * Out-of-range reads (off the end of the view) throw `RangeError` via
 * the underlying `getUint8` so corruption fails loudly instead of
 * silently returning zeros.
 */
class BitReader {
  private bitCursor = 0;

  constructor(
    private readonly view: DataView,
    private readonly byteOffset: number,
  ) {}

  readBits(n: number): number {
    if (n < 0 || n > 32) {
      throw new RangeError(`BitReader.readBits: n must be in [0, 32], got ${n}`);
    }
    let value = 0;
    let bitsRead = 0;
    while (bitsRead < n) {
      const byteIdx = this.byteOffset + ((this.bitCursor + bitsRead) >>> 3);
      const bitInByte = (this.bitCursor + bitsRead) & 7;
      const byte = this.view.getUint8(byteIdx);
      const bitsAvail = 8 - bitInByte;
      const bitsToTake = Math.min(bitsAvail, n - bitsRead);
      const mask = (1 << bitsToTake) - 1;
      const chunk = (byte >>> bitInByte) & mask;
      // Use Math.pow rather than `<<` to safely shift past 31 bits if
      // bitsRead approaches 32 (JS `<<` operates on signed int32).
      value += chunk * Math.pow(2, bitsRead);
      bitsRead += bitsToTake;
    }
    this.bitCursor += n;
    return value;
  }
}

/** Symmetric writer; collects into a flat byte array. */
class BitWriter {
  private readonly bytes: number[] = [];
  private bitCursor = 0;

  writeBits(value: number, n: number): void {
    if (n < 0 || n > 32) {
      throw new RangeError(`BitWriter.writeBits: n must be in [0, 32], got ${n}`);
    }
    if (value < 0 || value >= Math.pow(2, n)) {
      throw new RangeError(
        `BitWriter.writeBits: value ${value} does not fit in ${n} bits`,
      );
    }
    let bitsWritten = 0;
    while (bitsWritten < n) {
      const byteIdx = this.bitCursor >>> 3;
      const bitInByte = this.bitCursor & 7;
      while (this.bytes.length <= byteIdx) this.bytes.push(0);
      const bitsAvail = 8 - bitInByte;
      const bitsToPut = Math.min(bitsAvail, n - bitsWritten);
      const mask = (1 << bitsToPut) - 1;
      const chunk = Math.floor(value / Math.pow(2, bitsWritten)) & mask;
      this.bytes[byteIdx] = (this.bytes[byteIdx] ?? 0) | (chunk << bitInByte);
      this.bitCursor += bitsToPut;
      bitsWritten += bitsToPut;
    }
  }

  /** Pad current byte with zero bits to the next byte boundary. */
  alignToByte(): void {
    const rem = this.bitCursor & 7;
    if (rem !== 0) this.bitCursor += 8 - rem;
  }

  byteLength(): number {
    return Math.ceil(this.bitCursor / 8);
  }

  /** Pad with zero bytes until the buffer is `targetBytes` long. */
  padTo(targetBytes: number): void {
    while (this.bytes.length < targetBytes) this.bytes.push(0);
    this.bitCursor = targetBytes * 8;
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

/**
 * Validate the 8-byte universal header and return its parsed fields.
 * Throws `RangeError` on bad magic, unsupported version, or unexpected
 * file kind.
 */
function readHeader(
  view: DataView,
  expectedKind: FileKind,
): { version: number; kind: FileKind } {
  if (view.byteLength < 8) {
    throw new RangeError(`n2k: file is too small to contain a header (${view.byteLength}B)`);
  }
  const magic = view.getUint32(0, true);
  if (magic !== MAGIC) {
    throw new RangeError(
      `n2k: bad magic 0x${magic.toString(16).padStart(8, "0")}, ` +
        `expected 0x${MAGIC.toString(16).padStart(8, "0")}`,
    );
  }
  const version = view.getUint8(4);
  if (version !== VERSION) {
    throw new RangeError(`n2k: unsupported format version ${version} (this build reads v${VERSION})`);
  }
  const kindCode = view.getUint8(5);
  const expectedCode = FILE_KIND[expectedKind];
  if (kindCode !== expectedCode) {
    throw new RangeError(
      `n2k: file kind mismatch — expected ${expectedKind} (${expectedCode}), ` +
        `got ${kindCode}`,
    );
  }
  return { version, kind: expectedKind };
}

function writeHeader(view: DataView, kind: FileKind): void {
  view.setUint32(0, MAGIC, true);
  view.setUint8(4, VERSION);
  view.setUint8(5, FILE_KIND[kind]);
  view.setUint8(6, 0);
  view.setUint8(7, 0);
}

/** Number of bytes a single chunk record occupies for the given arity. */
function recordSizeFor(arity: number): number {
  if (arity === 3) return 6;
  if (arity === 4) return 7;
  if (arity === 5) return 8;
  throw new RangeError(`n2k: unsupported arity ${arity} (must be 3, 4, or 5)`);
}

function clampDiff100(d: number): number {
  if (!Number.isFinite(d) || d < 0) return 0;
  const v = Math.round(d * 100);
  return v > 10_000 ? 10_000 : v;
}

// ---------------------------------------------------------------------------
//  Chunk file: encode / decode
// ---------------------------------------------------------------------------

/**
 * Serialize a {@link Chunk} into a single binary blob.
 *
 * Header layout (12 + arity bytes, no alignment padding):
 *
 *   [8B universal header]
 *   [1B arity]
 *   [1B record_size]                  // derived from arity
 *   [2B record_count] uint16 LE
 *   [arity × 1B] dice values, int8
 *   [record_count × record_size B] records (bit-packed within each)
 */
export function encodeChunk(chunk: Chunk): Uint8Array {
  const { arity, dice, records } = chunk;
  if (dice.length !== arity) {
    throw new RangeError(`encodeChunk: dice.length (${dice.length}) !== arity (${arity})`);
  }
  if (records.length > 0xffff) {
    throw new RangeError(`encodeChunk: too many records (${records.length}), max 65535`);
  }
  for (const d of dice) {
    if (!Number.isInteger(d) || d < -128 || d > 127) {
      throw new RangeError(`encodeChunk: dice value ${d} out of int8 range`);
    }
  }

  const recordSize = recordSizeFor(arity);
  const headerSize = 12 + arity;
  const totalSize = headerSize + records.length * recordSize;

  const buf = new Uint8Array(totalSize);
  const view = new DataView(buf.buffer);
  writeHeader(view, "chunk");
  view.setUint8(8, arity);
  view.setUint8(9, recordSize);
  view.setUint16(10, records.length, true);
  for (let i = 0; i < arity; i += 1) {
    view.setInt8(12 + i, dice[i]!);
  }

  let offset = headerSize;
  for (const rec of records) {
    if (rec.exps.length !== arity || rec.ops.length !== arity - 1) {
      throw new RangeError(
        `encodeChunk: record arity mismatch (exps=${rec.exps.length}, ` +
          `ops=${rec.ops.length}, expected ${arity}/${arity - 1})`,
      );
    }
    if (!Number.isInteger(rec.target) || rec.target < 0 || rec.target > 0x1fff) {
      throw new RangeError(`encodeChunk: target ${rec.target} out of 13-bit range`);
    }
    const writer = new BitWriter();
    writer.writeBits(rec.target, 13);
    writer.writeBits(clampDiff100(rec.difficulty), 14);
    for (const p of rec.exps) {
      if (!Number.isInteger(p) || p < 0 || p > 31) {
        throw new RangeError(`encodeChunk: exponent ${p} out of 5-bit range`);
      }
      writer.writeBits(p, 5);
    }
    for (const op of rec.ops) {
      if (op !== 1 && op !== 2 && op !== 3 && op !== 4) {
        throw new RangeError(`encodeChunk: operator code ${op} not in 1..4`);
      }
      writer.writeBits(op - 1, 2);
    }
    writer.padTo(recordSize);
    buf.set(writer.toUint8Array(), offset);
    offset += recordSize;
  }
  return buf;
}

/** Inverse of {@link encodeChunk}. */
export function parseChunk(buf: ArrayBuffer): Chunk {
  const view = new DataView(buf);
  readHeader(view, "chunk");
  const arity = view.getUint8(8);
  const recordSize = view.getUint8(9);
  const recordCount = view.getUint16(10, true);
  if (recordSize !== recordSizeFor(arity)) {
    throw new RangeError(
      `parseChunk: record_size ${recordSize} doesn't match arity ${arity} ` +
        `(expected ${recordSizeFor(arity)})`,
    );
  }
  const dice: number[] = new Array(arity);
  for (let i = 0; i < arity; i += 1) {
    dice[i] = view.getInt8(12 + i);
  }

  const records: ChunkRecord[] = new Array(recordCount);
  const headerSize = 12 + arity;
  for (let r = 0; r < recordCount; r += 1) {
    const reader = new BitReader(view, headerSize + r * recordSize);
    const target = reader.readBits(13);
    const difficulty = reader.readBits(14) / 100;
    const exps: number[] = new Array(arity);
    for (let i = 0; i < arity; i += 1) exps[i] = reader.readBits(5);
    const ops: Operator[] = new Array(arity - 1);
    for (let i = 0; i < arity - 1; i += 1) {
      ops[i] = (reader.readBits(2) + 1) as Operator;
    }
    records[r] = { target, difficulty, exps, ops };
  }

  return { arity, dice, records };
}

// ---------------------------------------------------------------------------
//  Index file: encode / decode
// ---------------------------------------------------------------------------

/** Bytes per row in an index file for the given arity (no padding). */
function indexRowSize(arity: number): number {
  return arity + 12; // arity × 1B dice + (2+2+2+2+4)B stats
}

/**
 * Serialize an {@link IndexFile} into a binary blob.
 *
 * Header layout (16 bytes):
 *
 *   [8B universal header]
 *   [1B arity]
 *   [3B reserved zero]
 *   [4B tuple_count] uint32 LE
 */
export function encodeIndex(index: IndexFile): Uint8Array {
  const { arity, rows } = index;
  const rowSize = indexRowSize(arity);
  const headerSize = 16;
  const buf = new Uint8Array(headerSize + rows.length * rowSize);
  const view = new DataView(buf.buffer);
  writeHeader(view, "index");
  view.setUint8(8, arity);
  view.setUint8(9, 0);
  view.setUint8(10, 0);
  view.setUint8(11, 0);
  view.setUint32(12, rows.length, true);

  let offset = headerSize;
  for (const row of rows) {
    if (row.dice.length !== arity) {
      throw new RangeError(
        `encodeIndex: row.dice.length (${row.dice.length}) !== arity (${arity})`,
      );
    }
    for (let i = 0; i < arity; i += 1) {
      const d = row.dice[i]!;
      if (!Number.isInteger(d) || d < -128 || d > 127) {
        throw new RangeError(`encodeIndex: dice value ${d} out of int8 range`);
      }
      view.setInt8(offset + i, d);
    }
    let p = offset + arity;
    view.setUint16(p, row.solvableCount, true); p += 2;
    view.setUint16(p, row.impossibleCount, true); p += 2;
    view.setUint16(p, clampDiff100(row.minDifficulty), true); p += 2;
    view.setUint16(p, clampDiff100(row.maxDifficulty), true); p += 2;
    const avg10000 = Math.max(0, Math.min(0xffffffff, Math.round(row.averageDifficulty * 10_000)));
    view.setUint32(p, avg10000, true);
    offset += rowSize;
  }
  return buf;
}

/** Inverse of {@link encodeIndex}. */
export function parseIndex(buf: ArrayBuffer): IndexFile {
  const view = new DataView(buf);
  readHeader(view, "index");
  const arity = view.getUint8(8);
  const tupleCount = view.getUint32(12, true);
  const rowSize = indexRowSize(arity);
  const headerSize = 16;
  const rows: IndexRow[] = new Array(tupleCount);
  for (let r = 0; r < tupleCount; r += 1) {
    const offset = headerSize + r * rowSize;
    const dice: number[] = new Array(arity);
    for (let i = 0; i < arity; i += 1) dice[i] = view.getInt8(offset + i);
    let p = offset + arity;
    const solvableCount = view.getUint16(p, true); p += 2;
    const impossibleCount = view.getUint16(p, true); p += 2;
    const minDifficulty = view.getUint16(p, true) / 100; p += 2;
    const maxDifficulty = view.getUint16(p, true) / 100; p += 2;
    const averageDifficulty = view.getUint32(p, true) / 10_000;
    rows[r] = {
      dice,
      solvableCount,
      impossibleCount,
      minDifficulty,
      maxDifficulty,
      averageDifficulty,
    };
  }
  return { arity, rows };
}

// ---------------------------------------------------------------------------
//  Coverage file: encode / decode
// ---------------------------------------------------------------------------

const COVERAGE_ROW_SIZE = 8;

/**
 * Serialize a {@link CoverageFile} into a binary blob.
 *
 * Header layout (16 bytes):
 *
 *   [8B universal header]
 *   [1B arity]
 *   [3B reserved zero]
 *   [4B target_count] uint32 LE
 *
 * Rows are emitted in `target` ascending order; the row's target is
 * implied by its position (1-based: row r holds target r+1). Rows for
 * unsolvable targets store 0xFFFF for both diff fields and 0 for
 * `solvable_tuples` so the on-wire size is constant regardless of how
 * many targets are reachable.
 */
export function encodeCoverage(coverage: CoverageFile): Uint8Array {
  const { arity, rows } = coverage;
  const headerSize = 16;
  const buf = new Uint8Array(headerSize + rows.length * COVERAGE_ROW_SIZE);
  const view = new DataView(buf.buffer);
  writeHeader(view, "coverage");
  view.setUint8(8, arity);
  view.setUint8(9, 0);
  view.setUint8(10, 0);
  view.setUint8(11, 0);
  view.setUint32(12, rows.length, true);

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]!;
    if (row.target !== i + 1) {
      throw new RangeError(
        `encodeCoverage: rows must be ordered target=1..N, got target=${row.target} at row ${i}`,
      );
    }
    const offset = headerSize + i * COVERAGE_ROW_SIZE;
    const minVal = row.minDifficulty === null ? COVERAGE_NO_SOLUTION : clampDiff100(row.minDifficulty);
    const maxVal = row.maxDifficulty === null ? COVERAGE_NO_SOLUTION : clampDiff100(row.maxDifficulty);
    view.setUint16(offset, minVal, true);
    view.setUint16(offset + 2, maxVal, true);
    view.setUint32(offset + 4, row.solvableTuples, true);
  }
  return buf;
}

/** Inverse of {@link encodeCoverage}. */
export function parseCoverage(buf: ArrayBuffer): CoverageFile {
  const view = new DataView(buf);
  readHeader(view, "coverage");
  const arity = view.getUint8(8);
  const targetCount = view.getUint32(12, true);
  const headerSize = 16;
  const rows: CoverageRow[] = new Array(targetCount);
  for (let i = 0; i < targetCount; i += 1) {
    const offset = headerSize + i * COVERAGE_ROW_SIZE;
    const minRaw = view.getUint16(offset, true);
    const maxRaw = view.getUint16(offset + 2, true);
    const solvableTuples = view.getUint32(offset + 4, true);
    rows[i] = {
      target: i + 1,
      minDifficulty: minRaw === COVERAGE_NO_SOLUTION ? null : minRaw / 100,
      maxDifficulty: maxRaw === COVERAGE_NO_SOLUTION ? null : maxRaw / 100,
      solvableTuples,
    };
  }
  return { arity, rows };
}
