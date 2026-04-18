import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

/**
 * Thin wrapper around `readline` that exposes the small set of prompts the
 * REPL actually needs. Constructed once per session so we share a single
 * interface across commands.
 */
export class Prompt {
  private readonly rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({ input: stdin, output: stdout });
  }

  close(): void {
    this.rl.close();
  }

  async ask(question: string): Promise<string> {
    return (await this.rl.question(question)).trim();
  }

  /** Repeatedly prompt until the user enters a parseable integer. */
  async askInt(
    question: string,
    errorMessage = "Error, please enter an integer: ",
  ): Promise<number> {
    let prompt = question;
    for (;;) {
      const raw = await this.ask(prompt);
      if (/^-?\d+$/.test(raw)) return Number.parseInt(raw, 10);
      prompt = errorMessage;
    }
  }

  /** Prompt for an integer constrained to `[min, max]` inclusive. */
  async askIntInRange(
    question: string,
    min: number,
    max: number,
  ): Promise<number> {
    let value = await this.askInt(question);
    while (value < min || value > max) {
      value = await this.askInt(
        `Error, value out of range [${min}, ${max}]. Please re-enter value: `,
      );
    }
    return value;
  }

  /** Prompt for a yes/no choice. */
  async askYesNo(question: string): Promise<boolean> {
    for (;;) {
      const raw = (await this.ask(question)).toUpperCase();
      if (raw === "Y" || raw === "YES") return true;
      if (raw === "N" || raw === "NO") return false;
    }
  }
}
