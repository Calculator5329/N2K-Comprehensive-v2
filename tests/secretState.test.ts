import { describe, expect, it } from "vitest";
import { SecretState, KONAMI_INPUT } from "../src/cli/secretState.js";

describe("SecretState", () => {
  it("starts locked", () => {
    expect(new SecretState().isUnlocked()).toBe(false);
  });

  it("unlocks on the Konami sequence (case-insensitive)", () => {
    const s = new SecretState();
    expect(s.ingest(KONAMI_INPUT.toLowerCase())).toBe(true);
    expect(s.isUnlocked()).toBe(true);
  });

  it("unlocks even with embedded whitespace", () => {
    const s = new SecretState();
    expect(s.ingest("U D U D L R L R")).toBe(true);
    expect(s.isUnlocked()).toBe(true);
  });

  it("returns false on subsequent matches once already unlocked", () => {
    const s = new SecretState();
    s.ingest(KONAMI_INPUT);
    expect(s.ingest(KONAMI_INPUT)).toBe(false);
  });

  it("ignores non-matching input", () => {
    const s = new SecretState();
    expect(s.ingest("UDUD")).toBe(false);
    expect(s.ingest("9")).toBe(false);
    expect(s.ingest("")).toBe(false);
    expect(s.isUnlocked()).toBe(false);
  });

  it("forceUnlock bypasses the sequence", () => {
    const s = new SecretState();
    s.forceUnlock();
    expect(s.isUnlocked()).toBe(true);
  });
});
