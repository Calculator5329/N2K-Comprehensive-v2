import { BOARD } from "../core/constants.js";

/**
 * Print a flat 36-element list as a 6x6 board grid. Cells may be `null`
 * (rendered as `-`) so the same helper works for both numeric boards and
 * difficulty maps that include unsolvable cells.
 */
export function formatBoard(values: ReadonlyArray<number | null>): string {
  if (values.length !== BOARD.size) {
    throw new RangeError(
      `Board must contain exactly ${BOARD.size} values (got ${values.length})`,
    );
  }

  const rows: string[] = [];
  for (let row = 0; row < BOARD.rows; row += 1) {
    const cells: string[] = [];
    for (let col = 0; col < BOARD.cols; col += 1) {
      const value = values[row * BOARD.cols + col]!;
      cells.push(value === null ? "-" : String(value));
    }
    rows.push(cells.join(" "));
  }
  return rows.join("\n");
}

export function percent(part: number, whole: number): string {
  if (whole === 0) return "0.00%";
  return `${(Math.round((part / whole) * 10000) / 100).toFixed(2)}%`;
}
