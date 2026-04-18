import {
  cmdAdvancedSolve,
  cmdExportAllSolutions,
  cmdFindBoardDifficulty,
  cmdFindDifficulty,
  cmdGeneratePatternBoard,
  cmdGenerateRandomBoard,
  cmdGenerateRandomDice,
  cmdSolveEquation,
  type CommandHandler,
} from "./commands.js";
import { Prompt } from "./prompt.js";
import { SecretState } from "./secretState.js";

interface CommandSpec {
  readonly id: number;
  readonly title: string;
  /** Aliases the user may type to invoke this command (case-insensitive). */
  readonly aliases: readonly string[];
  readonly handler: CommandHandler | null;
  /** When true, omitted from the listing and unreachable until Æther mode is unlocked. */
  readonly secret?: boolean;
}

/** Build the alias set "<NAME>", "<N>", "COMMAND <N>", "C<N>". */
function aliasesFor(id: number, name: string): readonly string[] {
  const n = String(id);
  return [name.toUpperCase(), n, `COMMAND ${n}`, `C${n}`];
}

const COMMANDS: readonly CommandSpec[] = [
  { id: 1, title: "End",                     aliases: aliasesFor(1, "End"),                     handler: null },
  { id: 2, title: "List commands",           aliases: aliasesFor(2, "List commands"),           handler: null },
  { id: 3, title: "Generate random board",   aliases: aliasesFor(3, "Generate random board"),   handler: cmdGenerateRandomBoard },
  { id: 4, title: "Generate pattern board",  aliases: aliasesFor(4, "Generate pattern board"),  handler: cmdGeneratePatternBoard },
  { id: 5, title: "Generate random dice",    aliases: aliasesFor(5, "Generate random dice"),    handler: cmdGenerateRandomDice },
  { id: 6, title: "Solve equation",          aliases: aliasesFor(6, "Solve equation"),          handler: cmdSolveEquation },
  { id: 7, title: "Find difficulty",         aliases: aliasesFor(7, "Find difficulty"),         handler: cmdFindDifficulty },
  { id: 8, title: "Find board difficulty",   aliases: aliasesFor(8, "Find board difficulty"),   handler: cmdFindBoardDifficulty },
  { id: 9, title: "Export all solutions",    aliases: aliasesFor(9, "Export all solutions"),    handler: cmdExportAllSolutions },
  { id: 10, title: "Æther solve",            aliases: aliasesFor(10, "Aether solve"),           handler: cmdAdvancedSolve, secret: true },
];

function listCommands(secret: SecretState): string {
  return COMMANDS
    .filter((c) => !c.secret || secret.isUnlocked())
    .map((c) => `Command ${c.id}: ${c.title}`)
    .join("\n");
}

function findCommand(input: string, secret: SecretState): CommandSpec | null {
  const upper = input.toUpperCase();
  const match = COMMANDS.find((c) => c.aliases.includes(upper)) ?? null;
  if (match === null) return null;
  if (match.secret && !secret.isUnlocked()) return null;
  return match;
}

/**
 * Run the interactive REPL until the user issues the `End` command. All I/O
 * is owned by this function; service code remains pure.
 */
export async function runRepl(): Promise<void> {
  const prompt = new Prompt();
  const secret = new SecretState();
  console.log(
    "Welcome to the all in one N2K program. Type in any of the following words to execute a command.",
  );
  console.log(listCommands(secret));

  try {
    for (;;) {
      const input = await prompt.ask(
        secret.isUnlocked() ? "\nÆ Enter a command: " : "\nEnter a command: ",
      );

      if (secret.ingest(input)) {
        console.log(
          "\n✦ Æther mode unlocked. Hidden command #10 is now listed; export\n" +
            "  command #9 will offer the advanced (.n2k) flow. Type `2` to re-list.",
        );
        continue;
      }

      const command = findCommand(input, secret);
      if (command === null) {
        console.log("Error, command not in list of commands");
        continue;
      }

      if (command.id === 1) return;
      if (command.id === 2) {
        console.log(listCommands(secret));
        continue;
      }

      // Non-meta commands always have a handler.
      await command.handler!(prompt, secret);
    }
  } finally {
    prompt.close();
  }
}
