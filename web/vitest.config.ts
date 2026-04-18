import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";

/**
 * Web-workspace vitest config.
 *
 * Kept separate from the root config (which targets the solver in a
 * Node environment) so the boundary between solver tests and web
 * tests stays crisp. Uses `happy-dom` because we need `window`,
 * `localStorage`, and `window.location` for hash + persistence
 * round-trip tests.
 *
 * Tests live in `web/tests/` and are unit-focused: stores +
 * services. React component rendering is intentionally out of scope
 * — the value of these tests is locking down the data shape
 * contracts (URL hash schemas, persistence formats, theme registry
 * consistency) that earn no compile-time guarantee.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@solver": fileURLToPath(new URL("../src", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "happy-dom",
  },
});
