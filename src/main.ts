#!/usr/bin/env node
import { runRepl } from "./cli/repl.js";

runRepl().catch((err: unknown) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
