/**
 * Konami-style unlock state for the CLI's "Æther edition" features
 * (advanced solver, advanced export, hidden command #10).
 *
 * Discovery: type the literal sequence `UDUDLRLR` (case-insensitive,
 * spaces ignored) at any prompt. Once unlocked, hidden command #10
 * becomes available and command #9 (export) offers the advanced flow.
 *
 * Kept as a stateful class (rather than a module global) so tests can
 * construct fresh instances and so the REPL owns its own lifecycle.
 */

const KONAMI_SEQUENCE = "UDUDLRLR";

export class SecretState {
  private unlocked = false;

  isUnlocked(): boolean {
    return this.unlocked;
  }

  /**
   * Inspect a raw user input. Returns true if this input matched the
   * Konami sequence and flipped the unlock bit (caller can show a banner).
   * Returns false otherwise — including subsequent matches once already
   * unlocked.
   */
  ingest(input: string): boolean {
    if (this.unlocked) return false;
    const normalized = input.toUpperCase().replace(/\s+/g, "");
    if (normalized === KONAMI_SEQUENCE) {
      this.unlocked = true;
      return true;
    }
    return false;
  }

  /** Test/utility hook to force-unlock. Not used by the REPL. */
  forceUnlock(): void {
    this.unlocked = true;
  }
}

export const KONAMI_INPUT = KONAMI_SEQUENCE;
