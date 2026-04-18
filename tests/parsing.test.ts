import { describe, expect, it } from "vitest";
import {
  formatEquation,
  parseEquation,
  parseOperator,
} from "../src/services/parsing.js";

describe("parseOperator", () => {
  it("accepts trimmed and untrimmed operators", () => {
    expect(parseOperator("+")).toBe(1);
    expect(parseOperator(" + ")).toBe(1);
    expect(parseOperator("/")).toBe(4);
  });

  it("throws on unknown operators", () => {
    expect(() => parseOperator("?")).toThrow(SyntaxError);
  });
});

describe("parseEquation", () => {
  it("round-trips with formatEquation", () => {
    const original = "2^5 + 2^2 + 2^2 = 40";
    const parsed = parseEquation(original);
    expect(formatEquation(parsed)).toBe(original);
  });

  it("throws SyntaxError on malformed input (regression: Python crashed REPL)", () => {
    expect(() => parseEquation("totally not an equation")).toThrow(SyntaxError);
    expect(() => parseEquation("2 + 2 = 4")).toThrow(SyntaxError);
    expect(() => parseEquation("2^x + 2^2 + 2^2 = 40")).toThrow(SyntaxError);
  });
});
