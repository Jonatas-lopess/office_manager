import { createContext, useContext, ReactNode } from "react";
import { useDb } from "./context";
import { useSyncBridge, ConnectionStatus, Peer } from "@/hooks/useSyncBridge";

export interface SyncContextState {
  myId: string | null;
  connectedPeers: Peer[];
  connectionStatus: ConnectionStatus;
}

const SyncContext = createContext<SyncContextState | null>(null);

export function SyncProvider({
  hubIp,
  isTauri,
  children,
}: {
  hubIp: string | null;
  isTauri: boolean;
  children: ReactNode;
}) {
  const { db } = useDb();
  const wsUrl = hubIp ? `ws://${hubIp}:1234/ws` : `ws://localhost:1234/ws`;
  const syncState = useSyncBridge(db, wsUrl, isTauri);

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
