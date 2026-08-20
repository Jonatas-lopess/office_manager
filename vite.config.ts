import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  // A build compiled without this baked in produces a Hub that rejects
  // itself (src-tauri/src/lib.rs treats an empty token as invalid even
  // when both sides are empty) and a client that can't join any peer's
  // Hub either — ship it and every install is silently sync-dead.
  if (command === "build" && !env.VITE_SYNC_TOKEN) {
    throw new Error(
      "VITE_SYNC_TOKEN is not set. Set it in .env before building — " +
        "the sync Hub rejects empty tokens, so a build without it can't " +
        "host or join the LAN sync network on any machine.",
    );
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },

    // 1. Tauri specific: Prevents Vite from clearing the terminal screen,
    // so you don't lose Rust error messages.
    clearScreen: false,

    server: {
      port: 1420,
      strictPort: true,
      watch: {
        // Tell Vite to ignore changes in the Rust folder
        ignored: ["**/src-tauri/**"],
      },
      // 2. High-Performance SQLite Headers
      // cr-sqlite uses OPFS (Origin Private File System) and Web Workers.
      // To share memory between workers quickly, the browser requires your app to be "Isolated".
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
    },

    // 3. WebAssembly (WASM) Handling
    optimizeDeps: {
      // Vite tries to pre-bundle everything into standard JavaScript.
      // We must exclude the WASM package so it loads natively.
      exclude: ["@vlcn.io/crsqlite-wasm"],
      esbuildOptions: {
        // Required to allow "top-level await" when initializing the database
        target: "esnext",
      },
    },

    build: {
      // Ensure the final compiled app also supports modern WASM loading
      target: "esnext",
    },
  };
});
