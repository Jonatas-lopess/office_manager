import { DB } from "@vlcn.io/crsqlite-wasm";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { DBChangeHub } from "@/db/change-hub";
import { useAntiEntropySync } from "./useAntiEntropySync";
import { useEpochReset } from "./useEpochReset";
import { useHubConnection } from "./useHubConnection";

export type { ConnectionStatus, Peer } from "./types";

/**
 * Thin composer over useHubConnection (WS lifecycle) + useEpochReset
 * (epoch state / wipe) + useAntiEntropySync (request_sync/sync protocol).
 * Preserves the public shape the rest of the app depends on
 * (sync-context.tsx, main.tsx's AppLoader).
 */
export function useSyncBridge(
  ctx: DB,
  hub: DBChangeHub,
  initialHubUrl: string,
  isTauri: boolean,
  isolatedMode: boolean = false,
  siteId?: Uint8Array,
  siteIdHex?: string,
  initialVersion?: bigint,
) {
  // isInitialSyncFinished is written both by normal anti-entropy completion
  // and by an epoch wipe interrupting it — owned here so both hooks can
  // write to it via an explicit setter rather than a shared loose ref.
  const [isInitialSyncFinished, setIsInitialSyncFinishedState] =
    useState(false);
  const isInitialSyncFinishedRef = useRef(false);
  const setSyncFinished = useCallback((finished: boolean) => {
    setIsInitialSyncFinishedState(finished);
    isInitialSyncFinishedRef.current = finished;
  }, []);

  const hubConnection = useHubConnection(initialHubUrl, isTauri, isolatedMode);

  const epochApi = useEpochReset(
    ctx,
    hubConnection.send,
    hubConnection.disconnect,
    hubConnection.reconnect,
    hubConnection.onMessage,
    setSyncFinished,
  );

  useAntiEntropySync({
    ctx,
    hub,
    send: hubConnection.send,
    connectionStatus: hubConnection.connectionStatus,
    isolatedMode,
    onMessage: hubConnection.onMessage,
    epochRef: epochApi.epochRef,
    handleEpochMessage: epochApi.handleEpochMessage,
    siteId,
    siteIdHex,
    initialVersion,
    setSyncFinished,
    isInitialSyncFinishedRef,
  });

  useEffect(() => {
    const unlistenPromise = listen<string>("server-error", (event) => {
      console.error("❌ [Server Error] Server Start Error:", event.payload);
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  return {
    myId: hubConnection.myId,
    connectedPeers: hubConnection.connectedPeers,
    connectionStatus: hubConnection.connectionStatus,
    isInitialSyncFinished,
    resetSyncEpoch: epochApi.resetSyncEpoch,
  };
}
