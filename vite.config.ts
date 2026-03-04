import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

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
});
