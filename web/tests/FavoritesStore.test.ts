import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FavoritesStore } from "../src/stores/FavoritesStore";

const STORAGE_KEY = "n2k.favorites.v1";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe("FavoritesStore", () => {
  it("starts empty when localStorage is empty", () => {
    const fav = new FavoritesStore();
    expect(fav.size).toBe(0);
    expect(fav.has([2, 3, 5])).toBe(false);
    expect(fav.list()).toEqual([]);
  });

  it("toggle adds and removes a triple", () => {
    const fav = new FavoritesStore();
    fav.toggle([2, 3, 5]);
    expect(fav.has([2, 3, 5])).toBe(true);
    expect(fav.size).toBe(1);

    fav.toggle([2, 3, 5]);
    expect(fav.has([2, 3, 5])).toBe(false);
    expect(fav.size).toBe(0);
  });

  it("canonicalizes triple order before storing", () => {
    const fav = new FavoritesStore();
    fav.add([5, 2, 3]);
    expect(fav.has([2, 3, 5])).toBe(true);
    expect(fav.has([3, 5, 2])).toBe(true);
    expect(fav.size).toBe(1);
  });

  it("add is idempotent", () => {
    const fav = new FavoritesStore();
    fav.add([2, 3, 5]);
    fav.add([2, 3, 5]);
    fav.add([5, 3, 2]);
    expect(fav.size).toBe(1);
  });

  it("list returns triples in lex-sorted order", () => {
    const fav = new FavoritesStore();
    fav.add([5, 6, 7]);
    fav.add([2, 3, 5]);
    fav.add([1, 1, 1]);
    expect(fav.list()).toEqual([
      [1, 1, 1],
      [2, 3, 5],
      [5, 6, 7],
    ]);
  });

  it("clear removes all triples", () => {
    const fav = new FavoritesStore();
    fav.add([2, 3, 5]);
    fav.add([5, 6, 7]);
    fav.clear();
    expect(fav.size).toBe(0);
  });

  it("persists across instances via localStorage", () => {
    const a = new FavoritesStore();
    a.add([2, 3, 5]);
    a.add([4, 5, 6]);

    const b = new FavoritesStore();
    expect(b.size).toBe(2);
    expect(b.has([2, 3, 5])).toBe(true);
    expect(b.has([4, 5, 6])).toBe(true);
  });

  it("recovers gracefully from corrupt persisted data", () => {
    localStorage.setItem(STORAGE_KEY, "{not-json");
    const fav = new FavoritesStore();
    expect(fav.size).toBe(0);

    localStorage.setItem(STORAGE_KEY, JSON.stringify("not-an-array"));
    const fav2 = new FavoritesStore();
    expect(fav2.size).toBe(0);
  });

  it("drops corrupt entries inside the persisted array", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(["2-3-5", "garbage", "0-3-5", "3-5", null, "4-5-6"]),
    );
    const fav = new FavoritesStore();
    expect(fav.size).toBe(2);
    expect(fav.has([2, 3, 5])).toBe(true);
    expect(fav.has([4, 5, 6])).toBe(true);
  });

  it("rejects out-of-range dice values when reading persisted data", () => {
    // 21 is out of range for a die (max 20).
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["21-3-5"]));
    const fav = new FavoritesStore();
    expect(fav.size).toBe(0);
  });
});
