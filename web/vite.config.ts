import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";

// `BASE` lets the same build target both:
//   - the dev server / local preview (defaults to "/")
//   - GitHub Pages project hosting (set in CI to "/N2K-Comprehensive-v2/")
// Code that needs the prefix at runtime (e.g. fetching JSON from /data/...)
// reads `import.meta.env.BASE_URL`, which Vite injects from this value.
const BASE = process.env.VITE_BASE ?? "/";

export default defineConfig({
  base: BASE,
  plugins: [react()],
  resolve: {
    alias: {
      // Lets the web app import pure algorithms from the solver workspace
      // (e.g. `@solver/services/competition`). Mirrored in `tsconfig.json`.
      "@solver": fileURLToPath(new URL("../src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Bind to all interfaces so phones/tablets on the same LAN can reach the dev server.
    host: true,
    open: true,
  },
  preview: {
    port: 4173,
    host: true,
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
