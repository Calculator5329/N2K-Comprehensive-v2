import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearHash,
  readHash,
  subscribeHash,
  writeHash,
  type HashSchema,
} from "../src/services/urlHashState";

interface Sample {
  readonly name: string;
  readonly count: number;
}

const SAMPLE_SCHEMA: HashSchema<Sample> = {
  encode: ({ name, count }) => `1:${name}:${count}`,
  decode: (raw) => {
    const m = /^1:([^:]+):(\d+)$/.exec(raw);
    if (m === null) return null;
    return { name: m[1]!, count: Number(m[2]) };
  },
};

const NUMBER_SCHEMA: HashSchema<number> = {
  encode: (n) => String(n),
  decode: (raw) => {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  },
};

beforeEach(() => {
  // Each test starts from an empty hash.
  window.history.replaceState(null, "", window.location.pathname);
});

afterEach(() => {
  window.history.replaceState(null, "", window.location.pathname);
});

describe("urlHashState", () => {
  it("round-trips a single typed value", () => {
    writeHash("sample", { name: "alpha", count: 7 }, SAMPLE_SCHEMA);
    expect(readHash("sample", SAMPLE_SCHEMA)).toEqual({
      name: "alpha",
      count: 7,
    });
  });

  it("preserves unknown keys when writing", () => {
    writeHash("a", 1, NUMBER_SCHEMA);
    writeHash("b", 2, NUMBER_SCHEMA);
    writeHash("c", 3, NUMBER_SCHEMA);
    expect(readHash("a", NUMBER_SCHEMA)).toBe(1);
    expect(readHash("b", NUMBER_SCHEMA)).toBe(2);
    expect(readHash("c", NUMBER_SCHEMA)).toBe(3);
    // Hash should contain all three.
    expect(window.location.hash).toContain("a=1");
    expect(window.location.hash).toContain("b=2");
    expect(window.location.hash).toContain("c=3");
  });

  it("returns null when key is absent", () => {
    expect(readHash("missing", NUMBER_SCHEMA)).toBeNull();
  });

  it("returns null when the value fails to decode", () => {
    // Plant a raw hash that the schema can't parse.
    window.history.replaceState(null, "", "#sample=garbage");
    expect(readHash("sample", SAMPLE_SCHEMA)).toBeNull();
  });

  it("removes a key on writeHash(key, null, …)", () => {
    writeHash("a", 1, NUMBER_SCHEMA);
    writeHash("b", 2, NUMBER_SCHEMA);
    writeHash("a", null, NUMBER_SCHEMA);
    expect(readHash("a", NUMBER_SCHEMA)).toBeNull();
    expect(readHash("b", NUMBER_SCHEMA)).toBe(2);
  });

  it("clearHash removes only the requested key", () => {
    writeHash("a", 1, NUMBER_SCHEMA);
    writeHash("b", 2, NUMBER_SCHEMA);
    clearHash("a");
    expect(readHash("a", NUMBER_SCHEMA)).toBeNull();
    expect(readHash("b", NUMBER_SCHEMA)).toBe(2);
  });

  it("URL-encodes keys with reserved characters", () => {
    writeHash("a&b", 5, NUMBER_SCHEMA);
    // The literal "&" inside a key must NOT split the pair.
    expect(readHash("a&b", NUMBER_SCHEMA)).toBe(5);
  });

  it("subscribeHash fires on hashchange and ignores own writes", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeHash(listener);

    // writeHash uses replaceState — by design this should NOT trigger
    // the listener (the writer already has the latest value).
    writeHash("a", 1, NUMBER_SCHEMA);
    expect(listener).not.toHaveBeenCalled();

    // A real hashchange (back/forward, manual edit) triggers it.
    window.dispatchEvent(new Event("hashchange"));
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    window.dispatchEvent(new Event("hashchange"));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
