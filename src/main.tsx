import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";

// 1. vlcn.io and SQLite WASM imports
// The '?url' tells Vite to treat the WASM file as a static asset
import initWasm, { DB } from "@vlcn.io/crsqlite-wasm";
import wasmUrl from "@vlcn.io/crsqlite-wasm/crsqlite.wasm?url";

import App from "./App";

// --- PHASE 1: DATABASE INITIALIZATION ---
async function initDatabase() {
  // Load the WebAssembly SQLite engine
  const sqlite = await initWasm(() => wasmUrl);

  // Open (or create) the local database file.
  // Thanks to the Vite headers we set earlier, this uses ultra-fast OPFS storage!
  const db = await sqlite.open("my_local_database.db");

  // Run our schema migrations
  await db.execMany([
    `CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Onboarding'
    );`,
    `SELECT crsql_as_crr('clients');`,
  ]);

  // Return the complete context object expected by vlcn.io hooks
  return db;
}

// --- PHASE 2: THE BOOTSTRAPPER ---
function Root() {
  const [ctx, setCtx] = useState<DB | null>(null);
  const [hubIp, setHubIp] = useState<string | null>(null);
  const [isTauri, setIsTauri] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function bootSequence() {
      try {
        // 1. Initialize the database first
        const databaseContext = await initDatabase();
        let discoveredIp = null;
        let isTauriEnv = false;

        // 2. Safely attempt the network scan ONLY if running inside Tauri
        try {
          // Tauri injects an internal object into the window.
          // If it exists, we know we are in the desktop app!
          if ((window as any).__TAURI_INTERNALS__) {
            discoveredIp = await invoke<string | null>("find_hub_ip");
            isTauriEnv = true;
          } else {
            console.log("Running in standard browser. Skipping TCP scan.");
            // For local browser testing, we just leave discoveredIp as null,
            // which tells App.tsx to connect to ws://localhost:1234

            // NOTE: If you wanted to test on your phone browser, you could do:
            // discoveredIp = prompt("Enter the Tauri Hub IP address:");
          }
        } catch (invokeErr) {
          console.warn(
            "Tauri invoke failed (likely not in Tauri environment):",
            invokeErr,
          );
        }

        // 3. Set the state
        setCtx(databaseContext);
        setIsTauri(isTauriEnv);
        setHubIp(discoveredIp);
      } catch (err) {
        console.error("Failed to initialize database:", err);
        setError("Failed to start the local-first environment. Check console.");
      }
    }

    bootSequence();
  }, []);

  // Show a loading state while we scan the network and spin up WASM
  if (error)
    return <div style={{ color: "red", padding: "2rem" }}>{error}</div>;
  if (!ctx)
    return (
      <div style={{ padding: "2rem" }}>
        Booting database & scanning local network...
      </div>
    );

  // --- PHASE 3: RENDER THE APP ---
  return <App ctx={ctx} hubIp={hubIp} isTauri={isTauri} />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
