import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";

export default defineConfig({
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
