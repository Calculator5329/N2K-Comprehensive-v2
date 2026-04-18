import { resolve } from "node:path";
import {
  ADV_DICE_RANGE,
  ADV_TARGET_RANGE,
  DICE_COMBINATIONS,
} from "../core/constants.js";
import {
  assertValidBoard,
  bucketResults,
  scoreBoardForDice,
  type DiceBoardResult,
} from "../services/boardAnalysis.js";
import { difficultyOfEquation } from "../services/difficulty.js";
import { exportAllSolutions } from "../services/exporter.js";
import {
  generatePatternBoard,
  generateRandomBoard,
  generateRandomDice,
} from "../services/generators.js";
import { formatEquation, parseEquation } from "../services/parsing.js";
import { easiestSolution } from "../services/solver.js";
import { easiestAdvanced } from "../services/advancedSolver.js";
import { formatNEquation } from "../services/advancedParsing.js";
import { advDifficultyOfEquation } from "../services/advancedDifficulty.js";
import { formatBoard, percent } from "./format.js";
import type { Prompt } from "./prompt.js";
import type { SecretState } from "./secretState.js";
import type { Arity } from "../core/types.js";

/**
 * A REPL command handler. Each handler reads any input it needs from the
 * `Prompt`, performs work via the service layer, and writes output to stdout.
 *
 * Receives the {@link SecretState} so commands can branch on whether
 * Æther mode is unlocked (advanced solver, advanced export, etc).
 */
export type CommandHandler = (prompt: Prompt, secret: SecretState) => Promise<void>;

export async function cmdGenerateRandomBoard(prompt: Prompt): Promise<void> {
  const highest = await prompt.askIntInRange(
    "Enter the range of the board (e.g. 600 makes a board from 1-600): ",
    36,
    10_000,
  );
  console.log(generateRandomBoard(highest));
}

export async function cmdGeneratePatternBoard(prompt: Prompt): Promise<void> {
  const multiple = await prompt.askIntInRange(
    "Enter the multiple between numbers for the board: ",
    1,
    500,
  );
  console.log(generatePatternBoard([multiple]));
}

export async function cmdGenerateRandomDice(prompt: Prompt): Promise<void> {
  const maxDice = await prompt.askIntInRange(
    "Enter the maximum number for the first two dice: ",
    2,
    20,
  );
  const lastMaxDice = await prompt.askIntInRange(
    "Enter the maximum number for the last die: ",
    2,
    20,
  );
  console.log(generateRandomDice({ maxDice, lastMaxDice }));
}

export async function cmdSolveEquation(prompt: Prompt): Promise<void> {
  const d1 = await prompt.askIntInRange("Enter the first dice roll in the equation: ", 2, 20);
  const d2 = await prompt.askIntInRange("Enter the second dice roll in the equation: ", 2, 20);
  const d3 = await prompt.askIntInRange("Enter the third dice roll in the equation: ", 2, 20);
  const total = await prompt.askIntInRange(
    "Enter the board number for the equation: ",
    -1_000_000,
    1_000_000,
  );

  const solution = easiestSolution({ dice: [d1, d2, d3], total });
  if (solution === null) {
    console.log("No possible solution");
    return;
  }
  console.log(formatEquation(solution));
}

export async function cmdFindDifficulty(prompt: Prompt): Promise<void> {
  const raw = await prompt.ask(
    "Enter equation to find difficulty (Format: '2^5 + 2^2 + 2^2 = 40'): ",
  );
  try {
    const equation = parseEquation(raw);
    console.log(`Difficulty: ${difficultyOfEquation(equation)}`);
  } catch (err) {
    if (err instanceof SyntaxError) {
      console.log(`Could not parse equation: ${err.message}`);
      return;
    }
    throw err;
  }
}

export async function cmdFindBoardDifficulty(prompt: Prompt): Promise<void> {
  const raw = await prompt.ask("Enter board: ");
  let board: number[];
  try {
    board = raw
      .replace(/[\[\]]/g, "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => {
        if (!/^-?\d+$/.test(s)) {
          throw new SyntaxError(`"${s}" is not an integer`);
        }
        return Number.parseInt(s, 10);
      });
    assertValidBoard(board);
  } catch (err) {
    console.log(`Invalid board input: ${(err as Error).message}`);
    return;
  }

  const verbose = await prompt.askYesNo(
    "Would you like extra information to be outputted? (y or n): ",
  );

  const results: DiceBoardResult[] = [];
  for (let i = 0; i < DICE_COMBINATIONS.length; i += 1) {
    const dice = DICE_COMBINATIONS[i]!;
    if (i > 0 && i % Math.max(1, Math.floor(DICE_COMBINATIONS.length / 10)) === 0) {
      const pct = Math.round((i / DICE_COMBINATIONS.length) * 100);
      console.log(`Loading, ${pct}% Completed`);
    }
    const result = scoreBoardForDice(dice, board);
    results.push(result);

    if (verbose) {
      console.log(formatBoard(board));
      console.log(formatBoard(result.cellDifficulties));
      console.log(JSON.stringify(result.dice));
      console.log(percent(result.impossibleCount, board.length));
      if (result.averagePossibleDifficulty !== null) {
        console.log(String(result.averagePossibleDifficulty));
      }
    }
  }

  const buckets = bucketResults(results);
  console.log("\nBoard difficulty summary\n");
  for (const bucket of buckets) {
    const formatted = bucket.entries
      .map((e) => `${JSON.stringify(e.dice)}(${e.difficulty})`)
      .join(", ");
    console.log(
      `Dice that give difficulty from ${bucket.range[0]}-${bucket.range[1]}: [${formatted}]`,
    );
  }
}

export async function cmdExportAllSolutions(
  prompt: Prompt,
  secret: SecretState,
): Promise<void> {
  if (secret.isUnlocked()) {
    const useAdvanced = await prompt.askYesNo(
      "Æther mode unlocked — use the advanced (.n2k) exporter? (y or n): ",
    );
    if (useAdvanced) {
      console.log(
        "\nThe advanced exporter is driven by `npm run data:advanced` so it can\n" +
          "shard tuples across worker_threads (a single REPL turn would block I/O\n" +
          "for hours). Run that script to populate the .n2k dataset.\n",
      );
      console.log(
        `  Defaults: arity 3..5, dice ${ADV_DICE_RANGE.min}..${ADV_DICE_RANGE.max}, ` +
          `targets ${ADV_TARGET_RANGE.min}..${ADV_TARGET_RANGE.max}.\n`,
      );
      return;
    }
  }
  const defaultPath = "./n2k-export.ndjson";
  const rawPath = await prompt.ask(
    `Output path for NDJSON file [${defaultPath}]: `,
  );
  const outputPath = resolve(rawPath.length > 0 ? rawPath : defaultPath);

  const diceMin = await prompt.askIntInRange("Min dice value [1]: ", 1, 20);
  const diceMax = await prompt.askIntInRange(
    "Max dice value [20]: ",
    diceMin,
    20,
  );
  const totalMin = await prompt.askIntInRange("Min board total [1]: ", -1_000_000, 1_000_000);
  const totalMax = await prompt.askIntInRange(
    `Max board total [999]: `,
    totalMin,
    1_000_000,
  );
  const depower = await prompt.askYesNo(
    "Depower compound dice (4->2, 8->2, 9->3, 16->2)? (y or n): ",
  );

  console.log(
    `\nExporting solutions for dice [${diceMin}..${diceMax}] x totals ` +
      `[${totalMin}..${totalMax}] (depower=${depower}) -> ${outputPath}`,
  );
  console.log("This may take a minute or two...\n");

  let lastPctLogged = -1;
  const result = await exportAllSolutions(outputPath, {
    diceMin,
    diceMax,
    totalMin,
    totalMax,
    depower,
    onProgress: ({ done, total, dice, solvableCount }) => {
      const pct = Math.floor((done / total) * 100);
      // Only print on each new percent to avoid log spam.
      if (pct !== lastPctLogged) {
        lastPctLogged = pct;
        console.log(
          `  ${pct.toString().padStart(3, " ")}%  ` +
            `(${done}/${total})  dice=${JSON.stringify(dice)}  ` +
            `solvable=${solvableCount}`,
        );
      }
    },
  });

  const { manifest } = result;
  console.log(
    `\nDone in ${(manifest.elapsedMs / 1000).toFixed(1)}s. ` +
      `Wrote ${manifest.recordsWritten.toLocaleString()} records ` +
      `across ${manifest.diceTriplesTotal.toLocaleString()} dice triples.`,
  );
  console.log(`  Data:     ${result.outputPath}`);
  console.log(`  Manifest: ${result.manifestPath}`);
}

/**
 * Hidden command #10 (Æther solve): on-demand advanced solver with
 * arity 3..5, dice -10..32, and the new heuristic. Only listed once
 * {@link SecretState} is unlocked.
 */
export async function cmdAdvancedSolve(prompt: Prompt): Promise<void> {
  const arity = (await prompt.askIntInRange(
    "Number of dice (3, 4, or 5): ",
    3,
    5,
  )) as Arity;
  const dice: number[] = [];
  for (let i = 0; i < arity; i += 1) {
    dice.push(
      await prompt.askIntInRange(
        `Dice value #${i + 1} (${ADV_DICE_RANGE.min}..${ADV_DICE_RANGE.max}): `,
        ADV_DICE_RANGE.min,
        ADV_DICE_RANGE.max,
      ),
    );
  }
  const total = await prompt.askIntInRange(
    `Target board number (${ADV_TARGET_RANGE.min}..${ADV_TARGET_RANGE.max}): `,
    ADV_TARGET_RANGE.min,
    ADV_TARGET_RANGE.max,
  );

  console.log("\nSolving...");
  const t0 = Date.now();
  const eq = easiestAdvanced({ dice, total });
  const elapsed = Date.now() - t0;

  if (eq === null) {
    console.log(`No solution. (${elapsed}ms)`);
    return;
  }
  console.log(formatNEquation(eq));
  console.log(`  Difficulty: ${advDifficultyOfEquation(eq)}`);
  console.log(`  Used arity: ${eq.dice.length}`);
  console.log(`  Time:       ${elapsed}ms`);
}
