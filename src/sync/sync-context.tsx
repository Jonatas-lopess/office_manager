import { createContext, useContext, ReactNode } from "react";
import { useDb } from "@/db/context";
import { useSyncBridge, ConnectionStatus, Peer } from "./useSyncBridge";

export interface SyncContextState {
  myId: string | null;
  connectedPeers: Peer[];
  connectionStatus: ConnectionStatus;
  isInitialSyncFinished: boolean;
  resetSyncEpoch: (newEpoch: string) => void;
}

const SyncContext = createContext<SyncContextState | null>(null);

export function SyncProvider({
  hubIp,
  isTauri,
  isolatedMode = false,
  children,
}: {
  hubIp: string | null;
  isTauri: boolean;
  isolatedMode?: boolean;
  children: ReactNode;
}) {
  const { db, hub, siteId, siteIdHex, initialVersion } = useDb();
  const wsUrl = hubIp ? `ws://${hubIp}:1234/ws` : `ws://localhost:1234/ws`;
  const syncState = useSyncBridge(
    db,
    hub,
    wsUrl,
    isTauri,
    isolatedMode,
    siteId,
    siteIdHex,
    initialVersion,
  );

  return (
    <SyncContext.Provider value={syncState}>{children}</SyncContext.Provider>
  );
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error("useSync must be used within a SyncProvider");
  }
  return context;
}
