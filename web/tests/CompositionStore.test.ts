import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DataStore } from "../src/stores/DataStore";
import {
  CompositionStore,
  type SharedPlanV1,
} from "../src/features/compose/CompositionStore";

beforeEach(() => {
  // Each test starts from a clean window.location and localStorage.
  window.history.replaceState(null, "", window.location.pathname);
  localStorage.clear();
});

afterEach(() => {
  window.history.replaceState(null, "", window.location.pathname);
  localStorage.clear();
});

describe("CompositionStore", () => {
  describe("snapshot()", () => {
    it("captures the default 2-board plan with empty overrides", () => {
      const store = new CompositionStore(new DataStore());
      const snap = store.snapshot();
      expect(snap.version).toBe(1);
      expect(snap.pool).toBe("standard");
      expect(snap.timeBudget).toBe(60);
      expect(snap.seed).toBe("");
      expect(snap.boards).toHaveLength(2);
      expect(snap.boards[0]!.kind).toBe("random");
      expect(snap.boards[0]!.overrides).toEqual([]);
      expect(snap.boards[1]!.kind).toBe("pattern");
    });

    it("excludes generated previews and results from the envelope", () => {
      const store = new CompositionStore(new DataStore());
      const snap = store.snapshot();
      // The envelope is a plain data shape — no `preview`, `result`,
      // `status`, or `errorMessage` keys leak into the URL payload.
      for (const board of snap.boards) {
        expect(Object.keys(board).sort()).toEqual(
          [
            "kind",
            "multiples",
            "overrides",
            "patternStart",
            "rangeMax",
            "rangeMin",
            "rounds",
          ].sort(),
        );
      }
    });

    it("captures pinned overrides with their slot indices", () => {
      const store = new CompositionStore(new DataStore());
      const boardId = store.boards[0]!.id;
      store.setOverride(boardId, 0, 42);
      store.setOverride(boardId, 17, 99);
      const snap = store.snapshot();
      expect(snap.boards[0]!.overrides).toContainEqual([0, 42]);
      expect(snap.boards[0]!.overrides).toContainEqual([17, 99]);
    });
  });

  describe("applySnapshot()", () => {
    it("rejects non-v1 envelopes silently", () => {
      const store = new CompositionStore(new DataStore());
      const before = store.snapshot();
      // Cast through unknown so we can poke an unsupported version.
      store.applySnapshot({ ...before, version: 999 } as unknown as SharedPlanV1);
      expect(store.snapshot()).toEqual(before);
    });

    it("replaces the in-memory plan and round-trips losslessly", () => {
      const store = new CompositionStore(new DataStore());
      const plan: SharedPlanV1 = {
        version: 1,
        pool: "standard",
        timeBudget: 120,
        seed: "round-trip-seed",
        boards: [
          {
            kind: "random",
            rangeMin: 50,
            rangeMax: 250,
            multiples: [6],
            patternStart: 6,
            rounds: 5,
            overrides: [
              [0, 12],
              [35, 88],
            ],
          },
          {
            kind: "pattern",
            rangeMin: 1,
            rangeMax: 999,
            multiples: [3, 7],
            patternStart: 21,
            rounds: 3,
            overrides: [],
          },
        ],
      };
      store.applySnapshot(plan);
      const out = store.snapshot();
      expect(out.pool).toBe(plan.pool);
      expect(out.timeBudget).toBe(plan.timeBudget);
      expect(out.seed).toBe(plan.seed);
      expect(out.boards).toHaveLength(2);
      expect(out.boards[0]!.rangeMin).toBe(50);
      expect(out.boards[0]!.rangeMax).toBe(250);
      expect(out.boards[0]!.rounds).toBe(5);
      expect(out.boards[0]!.overrides.sort()).toEqual(
        [
          [0, 12],
          [35, 88],
        ].sort(),
      );
      expect(out.boards[1]!.kind).toBe("pattern");
      expect(out.boards[1]!.multiples).toEqual([3, 7]);
      expect(out.boards[1]!.patternStart).toBe(21);
    });

    it("clears any prior generation state when replacing the plan", () => {
      const store = new CompositionStore(new DataStore());
      // Manually mark a board "ready" to simulate a prior run.
      store.boards[0]!.status = "ready";
      store.boards[0]!.errorMessage = "stale";
      store.applySnapshot({
        version: 1,
        pool: "standard",
        timeBudget: 60,
        seed: "",
        boards: [
          {
            kind: "random",
            rangeMin: 1,
            rangeMax: 100,
            multiples: [6],
            patternStart: 6,
            rounds: 2,
            overrides: [],
          },
        ],
      });
      expect(store.boards).toHaveLength(1);
      expect(store.boards[0]!.status).toBe("idle");
      expect(store.boards[0]!.errorMessage).toBeNull();
      expect(store.boards[0]!.preview).toBeNull();
      expect(store.boards[0]!.result).toBeNull();
    });
  });

  describe("URL round-trip (#17)", () => {
    it("buildShareUrl + loadFromUrl restore the plan", async () => {
      const sender = new CompositionStore(new DataStore());
      sender.setSeed("share-test");
      sender.setTimeBudget(120);
      sender.setOverride(sender.boards[0]!.id, 5, 73);

      const url = await sender.buildShareUrl();
      expect(url).toContain("#plan=");

      // The receiver loads from the same window.location.hash.
      const receiver = new CompositionStore(new DataStore());
      const loaded = await receiver.loadFromUrl();
      expect(loaded).toBe(true);

      const sent = sender.snapshot();
      const recv = receiver.snapshot();
      expect(recv.seed).toBe(sent.seed);
      expect(recv.timeBudget).toBe(sent.timeBudget);
      expect(recv.boards.map((b) => b.kind)).toEqual(
        sent.boards.map((b) => b.kind),
      );
      expect(recv.boards[0]!.overrides).toContainEqual([5, 73]);
    });

    it("loadFromUrl returns false when no plan is present", async () => {
      const store = new CompositionStore(new DataStore());
      const loaded = await store.loadFromUrl();
      expect(loaded).toBe(false);
    });
  });
});
