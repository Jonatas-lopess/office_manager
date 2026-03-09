import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";
import { DbProvider, DbContextState } from "./db/context";
import { initDb } from "./db";

let isBooting = false;

function Root() {
  const [dbState, setDbState] = useState<DbContextState | null>(null);
  const [hubIp, setHubIp] = useState<string | null>(null);
  const [isTauri, setIsTauri] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function bootSequence() {
      if (isBooting) return;
      isBooting = true;

      try {
        // 1. Initialize the database first
        const dbContext = await initDb();
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
          }
        } catch (invokeErr) {
          console.warn(
            "Tauri invoke failed (likely not in Tauri environment):",
            invokeErr,
          );
        }

        // 3. Set the state
        setDbState(dbContext);
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
  if (!dbState)
    return (
      <div style={{ padding: "2rem" }}>
        Booting database & scanning local network...
      </div>
    );

  return (
    <DbProvider db={dbState.db} orm={dbState.orm}>
      <App hubIp={hubIp} isTauri={isTauri} />
    </DbProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
