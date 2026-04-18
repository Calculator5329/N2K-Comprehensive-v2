import { observer } from "mobx-react-lite";
import { DiceGlyph } from "../../ui/DiceGlyph";
import { DifficultyMeter } from "../../ui/DifficultyMeter";
import {
  BOARD_COLS,
  BOARD_SIZE,
  type BoardConfig,
  type CompositionStore,
} from "./CompositionStore";

/**
 * Renders the per-board competition output: the generated 6×6 board, plus a
 * round-by-round table of dice + difficulties + expected scores for both
 * players, and the per-player totals + delta.
 */
export const CompetitionResults = observer(function CompetitionResults({
  store,
}: {
  store: CompositionStore;
}) {
  if (store.boards.every((b) => b.result === null)) {
    return null;
  }
  return (
    <section>
      <div className="label-caps mb-4">Results</div>
      <div className="space-y-10">
        {store.boards.map((board, i) =>
          board.result === null ? null : (
            <BoardResult key={board.id} board={board} index={i} />
          ),
        )}
      </div>
    </section>
  );
});

const BoardResult = observer(function BoardResult({
  board,
  index,
}: {
  board: BoardConfig;
  index: number;
}) {
  const result = board.result!;
  const preview = board.preview ?? [];

  return (
    <div className="compose-board-sheet border border-ink-100/20 bg-paper-50 px-6 py-5">
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[10px] tracking-wide-caps uppercase text-oxblood-500">
            Board {index + 1}
          </span>
          <span
            className="font-display text-[22px] text-ink-500 leading-none"
            style={{ fontVariationSettings: '"opsz" 100, "SOFT" 30' }}
          >
            {board.kind === "random"
              ? `Random ${board.rangeMin}–${board.rangeMax}`
              : `Pattern [${board.multiples.join(", ")}] start ${board.patternStart}`}
          </span>
        </div>
        <span className="font-mono text-[11px] tracking-wide-caps uppercase text-ink-100">
          {board.rounds} round{board.rounds === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid grid-cols-12 gap-y-6 md:gap-6">
        <div className="col-span-12 md:col-span-5 min-w-0">
          <div className="label-caps mb-2">Generated board</div>
          <BoardGrid cells={preview} overrides={board.overrides} />
        </div>

        <div className="col-span-12 md:col-span-7 min-w-0">
          <RoundsTable board={board} />
          <Totals
            p1={result.p1TotalDifficulty}
            p2={result.p2TotalDifficulty}
            difficultyDelta={result.difficultyDelta}
            p1Score={result.p1TotalExpectedScore}
            p2Score={result.p2TotalExpectedScore}
            expectedScoreDelta={result.expectedScoreDelta}
          />
        </div>
      </div>
    </div>
  );
});

function BoardGrid({
  cells,
  overrides,
}: {
  cells: readonly number[];
  overrides: ReadonlyMap<number, number>;
}) {
  return (
    <div
      className="grid gap-px bg-ink-100/15 p-px"
      style={{
        gridTemplateColumns: `repeat(${BOARD_COLS}, minmax(0, 1fr))`,
        borderRadius: "2px",
      }}
    >
      {Array.from({ length: BOARD_SIZE }).map((_, slot) => {
        const value = cells[slot];
        const isPinnedSlot = overrides.has(slot);
        return (
          <div
            key={slot}
            className={[
              "h-12 flex items-center justify-center bg-paper-50 font-mono tabular text-[13px]",
              isPinnedSlot ? "text-oxblood-500 font-medium" : "text-ink-300",
            ].join(" ")}
          >
            {value ?? ""}
          </div>
        );
      })}
    </div>
  );
}

const RoundsTable = observer(function RoundsTable({
  board,
}: {
  board: BoardConfig;
}) {
  const result = board.result!;
  return (
    <div>
      <div className="label-caps mb-2">Rolls per round</div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-ink-100/30 text-left">
            <th className="py-2 pr-2 font-mono uppercase tracking-wide-caps text-ink-100 text-[10px]">#</th>
            <th className="py-2 px-2 font-mono uppercase tracking-wide-caps text-ink-100 text-[10px]">P1 dice</th>
            <th className="py-2 px-2 font-mono uppercase tracking-wide-caps text-ink-100 text-[10px]">P1 diff</th>
            <th className="py-2 px-2 font-mono uppercase tracking-wide-caps text-ink-100 text-[10px]">P1 exp.</th>
            <th className="py-2 px-2 font-mono uppercase tracking-wide-caps text-ink-100 text-[10px]">P2 dice</th>
            <th className="py-2 px-2 font-mono uppercase tracking-wide-caps text-ink-100 text-[10px]">P2 diff</th>
            <th className="py-2 px-2 font-mono uppercase tracking-wide-caps text-ink-100 text-[10px]">P2 exp.</th>
          </tr>
        </thead>
        <tbody>
          {result.rounds.map((r, i) => (
            <tr key={i} className="border-b border-ink-100/10">
              <td className="py-2 pr-2 font-mono tabular text-ink-200">{i + 1}</td>
              <td className="py-2 px-2"><DiceGlyph dice={r.p1} size="sm" /></td>
              <td className="py-2 px-2">
                <DifficultyMeter difficulty={r.p1Difficulty} size="sm" />
              </td>
              <td className="py-2 px-2 font-mono tabular text-ink-300">
                {r.p1ExpectedScore.toFixed(1)}
              </td>
              <td className="py-2 px-2"><DiceGlyph dice={r.p2} size="sm" /></td>
              <td className="py-2 px-2">
                <DifficultyMeter difficulty={r.p2Difficulty} size="sm" />
              </td>
              <td className="py-2 px-2 font-mono tabular text-ink-300">
                {r.p2ExpectedScore.toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

function Totals({
  p1,
  p2,
  difficultyDelta,
  p1Score,
  p2Score,
  expectedScoreDelta,
}: {
  p1: number;
  p2: number;
  difficultyDelta: number;
  p1Score: number;
  p2Score: number;
  expectedScoreDelta: number;
}) {
  const higherScorePlayer =
    expectedScoreDelta > 0 ? "P1" : expectedScoreDelta < 0 ? "P2" : null;
  const harderPlayer =
    difficultyDelta > 0 ? "P1" : difficultyDelta < 0 ? "P2" : null;
  return (
    <div className="mt-4 pt-3 border-t border-ink-100/20 grid grid-cols-2 md:grid-cols-4 gap-4 font-mono text-[12px]">
      <Cell label="P1 totals" diff={p1} score={p1Score} />
      <Cell label="P2 totals" diff={p2} score={p2Score} />
      <div>
        <div className="label-caps mb-0.5">Δ expected score</div>
        <div className="text-ink-500 text-[16px] tabular">
          {Math.abs(expectedScoreDelta).toFixed(1)}
          {higherScorePlayer && (
            <span className="ml-1 text-[10px] uppercase tracking-wide-caps text-ink-100">
              {higherScorePlayer} higher
            </span>
          )}
        </div>
      </div>
      <div>
        <div className="label-caps mb-0.5">Δ difficulty</div>
        <div className="text-ink-500 text-[16px] tabular">
          {Math.abs(difficultyDelta).toFixed(2)}
          {harderPlayer && (
            <span className="ml-1 text-[10px] uppercase tracking-wide-caps text-ink-100">
              {harderPlayer} harder
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Cell({ label, diff, score }: { label: string; diff: number; score: number }) {
  return (
    <div>
      <div className="label-caps mb-0.5">{label}</div>
      <div className="text-ink-500 text-[14px] tabular">
        diff {diff.toFixed(2)} <span className="text-ink-100">/</span> exp {score.toFixed(1)}
      </div>
    </div>
  );
}
