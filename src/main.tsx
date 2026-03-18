import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";
import "./index.css";
import { DbProvider, DbContextState } from "./db/context";
import { initDb } from "./db";
import { SyncProvider, useSync } from "./db/sync-context";
import { Loader2 } from "lucide-react";

let isBooting = false;

function LoadingScreen({
  message,
  subMessage,
}: {
  message: string;
  subMessage: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 text-slate-900 p-4">
      <div className="flex flex-col items-center max-w-md w-full p-8 bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 animate-in fade-in zoom-in duration-500">
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full"></div>
          <Loader2 className="w-16 h-16 text-blue-600 animate-spin relative z-10" />
        </div>

        <h2 className="text-2xl font-semibold mb-2 tracking-tight text-center">
          {message}
        </h2>
        <p className="text-slate-500 text-center text-sm">{subMessage}</p>

        {/* Progress bar simulation */}
        <div className="w-full h-1.5 bg-slate-100 rounded-full mt-8 overflow-hidden">
          <div className="h-full bg-blue-600 w-full animate-pulse rounded-full origin-left scale-x-100 transition-transform duration-1000"></div>
        </div>
      </div>
    </div>
  );
}

function AppLoader() {
  const { isInitialSyncFinished, connectionStatus } = useSync();



  if (!isInitialSyncFinished) {
    let message = "Synchronizing data...";
    let subMessage = "Fetching the latest updates from the network";

    if (connectionStatus === "connecting") {
      message = "Connecting to Hub...";
      subMessage = "Establishing secure connection";
    } else if (connectionStatus === "reconnecting") {
      message = "Reconnecting...";
      subMessage = "Lost connection, trying to recover";
    } else if (connectionStatus === "disconnected") {
      message = "Isolated Mode";
      subMessage = "No hub connected, using local database only";
    }

    return <LoadingScreen message={message} subMessage={subMessage} />;
  }

  return <App />;
}

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
          if ((window as any).__TAURI_INTERNALS__) {
            discoveredIp = await invoke<string | null>("find_hub_ip");
            isTauriEnv = true;
          } else {
            // Running in standard browser. Skipping TCP scan.
          }
        } catch (invokeErr) {
          console.warn("Tauri invoke failed (likely not in Tauri environment):", invokeErr);
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

    if ((window as any).__TAURI_INTERNALS__) {
      invoke("close_splashscreen").catch((err) =>
        console.error("Failed to close splashscreen:", err),
      );
    }

    bootSequence();
  }, []);

  // Show a loading state while we scan the network and spin up WASM
  if (error)
    return <div style={{ color: "red", padding: "2rem" }}>{error}</div>;
  if (!dbState)
    return (
      <LoadingScreen
        message="Booting database engines..."
        subMessage="Initializing local storage"
      />
    );

  return (
    <DbProvider db={dbState.db} orm={dbState.orm}>
      <SyncProvider hubIp={hubIp} isTauri={isTauri}>
        <AppLoader />
      </SyncProvider>
    </DbProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
