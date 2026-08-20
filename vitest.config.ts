import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Separate from vite.config.ts: that file throws when VITE_SYNC_TOKEN is
// unset under command "build", and pulls in Tauri dev-server/WASM options
// pure unit tests don't need.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
