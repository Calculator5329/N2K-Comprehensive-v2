import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BalancedRollsResult } from "@solver/services/competition.js";
import { DataStore } from "../src/stores/DataStore";
import {
  CompositionStore,
  type SharedPlanV1,
  type SharedPlanV2,
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
      expect(snap.version).toBe(2);
      expect(snap.pool).toBe("standard");
      expect(snap.timeBudget).toBe(60);
      expect(snap.seed).toBe("");
      expect(snap.boards).toHaveLength(2);
      expect(snap.boards[0]!.kind).toBe("random");
      expect(snap.boards[0]!.overrides).toEqual([]);
      expect(snap.boards[1]!.kind).toBe("pattern");
    });

    it("omits preview/result keys for boards that haven't been generated", () => {
      const store = new CompositionStore(new DataStore());
      const snap = store.snapshot();
      // Ungenerated boards stay compact: no preview/result/status/error
      // keys leak into the URL payload, so a "share before generating"
      // link is the same size as the old v1 envelope.
      for (const board of snap.boards) {
        expect(board).not.toHaveProperty("preview");
        expect(board).not.toHaveProperty("result");
        expect(board).not.toHaveProperty("status");
        expect(board).not.toHaveProperty("errorMessage");
      }
    });

    it("includes preview + result for boards that have been generated", () => {
      const store = new CompositionStore(new DataStore());
      const board = store.boards[0]!;
      board.preview = Array.from({ length: 36 }, (_, i) => i + 1);
      board.result = makeFakeResult(2, 0);
      board.status = "ready";
      const snap = store.snapshot();
      expect(snap.boards[0]!.preview).toHaveLength(36);
      expect(snap.boards[0]!.result?.rounds).toHaveLength(2);
      // The second (untouched) board still omits the optional fields,
      // so per-board opt-in works.
      expect(snap.boards[1]!.preview).toBeUndefined();
      expect(snap.boards[1]!.result).toBeUndefined();
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
    it("rejects unsupported envelopes silently", () => {
      const store = new CompositionStore(new DataStore());
      const before = store.snapshot();
      // Cast through unknown so we can poke an unsupported version.
      store.applySnapshot({ ...before, version: 999 } as unknown as SharedPlanV2);
      expect(store.snapshot()).toEqual(before);
    });

    it("accepts a legacy v1 envelope and round-trips its config fields", () => {
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

    it("v2 share carries the boards + dice rolls; receiver lands on them in 'ready' state", async () => {
      // Sender simulates a fully-generated competition: two boards,
      // each with a 36-cell preview and a `BalancedRollsResult`. The
      // receiver should see those exact rolls without running the
      // solver again.
      const sender = new CompositionStore(new DataStore());
      sender.setSeed("");
      sender.boards[0]!.preview = Array.from({ length: 36 }, (_, i) => 100 + i);
      sender.boards[0]!.result = makeFakeResult(3, 0xa);
      sender.boards[0]!.status = "ready";
      sender.boards[1]!.preview = Array.from({ length: 36 }, (_, i) => 200 + i);
      sender.boards[1]!.result = makeFakeResult(2, 0xb);
      sender.boards[1]!.status = "ready";

      const url = await sender.buildShareUrl();
      expect(url).toContain("#plan=");

      const receiver = new CompositionStore(new DataStore());
      const loaded = await receiver.loadFromUrl();
      expect(loaded).toBe(true);

      // Status flipped to "ready" so CompetitionResults will render
      // immediately — no Generate click required.
      expect(receiver.boards[0]!.status).toBe("ready");
      expect(receiver.boards[1]!.status).toBe("ready");

      // Cells round-trip exactly.
      expect(receiver.boards[0]!.preview).toEqual(sender.boards[0]!.preview);
      expect(receiver.boards[1]!.preview).toEqual(sender.boards[1]!.preview);

      // Dice rolls round-trip exactly per round, including the totals
      // that drive the headline Δ score / Δ difficulty pills.
      expect(receiver.boards[0]!.result?.rounds).toEqual(
        sender.boards[0]!.result.rounds,
      );
      expect(receiver.boards[0]!.result?.expectedScoreDelta).toBe(
        sender.boards[0]!.result.expectedScoreDelta,
      );
      expect(receiver.boards[1]!.result?.rounds).toEqual(
        sender.boards[1]!.result.rounds,
      );
    });

    it("v1 permalinks still load (back-compat) but stay in 'idle' state", async () => {
      // Older shares lack preview/result; the receiver should still
      // pick up the configs and behave as if the user just typed the
      // plan in by hand — i.e. no spurious "ready" state, no fake
      // result object.
      const sender = new CompositionStore(new DataStore());
      sender.setSeed("legacy-v1");
      sender.setOverride(sender.boards[0]!.id, 7, 42);
      const v1: SharedPlanV1 = {
        version: 1,
        pool: sender.candidatePool,
        timeBudget: sender.timeBudget,
        seed: sender.seed,
        boards: sender.boards.map((b) => ({
          kind: b.kind,
          rangeMin: b.rangeMin,
          rangeMax: b.rangeMax,
          multiples: [...b.multiples],
          patternStart: b.patternStart,
          rounds: b.rounds,
          overrides: [...b.overrides.entries()],
        })),
      };

      const receiver = new CompositionStore(new DataStore());
      receiver.applySnapshot(v1);
      expect(receiver.seed).toBe("legacy-v1");
      expect(receiver.boards[0]!.overrides.get(7)).toBe(42);
      expect(receiver.boards[0]!.status).toBe("idle");
      expect(receiver.boards[0]!.preview).toBeNull();
      expect(receiver.boards[0]!.result).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

/**
 * Build a `BalancedRollsResult` with deterministic but non-trivial values
 * so round-trip assertions catch any field-dropping. Salt distinguishes
 * one fake result from another in the same test.
 */
function makeFakeResult(rounds: number, salt: number): BalancedRollsResult {
  const r = Array.from({ length: rounds }, (_, i) => ({
    p1: [salt + i, salt + i + 1, salt + i + 2] as readonly [number, number, number],
    p2: [salt + i + 3, salt + i + 4, salt + i + 5] as readonly [number, number, number],
    p1Difficulty: 10 + i,
    p2Difficulty: 12 + i,
    p1ExpectedScore: 50 + i * 3,
    p2ExpectedScore: 48 + i * 3,
  }));
  let p1d = 0;
  let p2d = 0;
  let p1s = 0;
  let p2s = 0;
  for (const round of r) {
    p1d += round.p1Difficulty;
    p2d += round.p2Difficulty;
    p1s += round.p1ExpectedScore;
    p2s += round.p2ExpectedScore;
  }
  return {
    rounds: r,
    p1TotalDifficulty: p1d,
    p2TotalDifficulty: p2d,
    difficultyDelta: p1d - p2d,
    p1TotalExpectedScore: p1s,
    p2TotalExpectedScore: p2s,
    expectedScoreDelta: p1s - p2s,
  };
}
