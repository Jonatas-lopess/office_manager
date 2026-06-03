import { createContext, useContext, ReactNode } from "react";
import { DB } from "@vlcn.io/crsqlite-wasm";
import { DrizzleDB } from "./index";
import { DBChangeHub } from "./change-hub";

export interface DbContextState {
  db: DB;
  orm: DrizzleDB;
  hub: DBChangeHub;
  siteId: Uint8Array;
  siteIdHex: string;
  initialVersion: bigint;
}

const DbContext = createContext<DbContextState | null>(null);

export function DbProvider({
  db,
  orm,
  hub,
  siteId,
  siteIdHex,
  initialVersion,
  children,
}: DbContextState & { children: ReactNode }) {
  return (
    <DbContext.Provider
      value={{ db, orm, hub, siteId, siteIdHex, initialVersion }}
    >
      {children}
    </DbContext.Provider>
  );
}

export function useDb() {
  const context = useContext(DbContext);
  if (!context) {
    throw new Error("useDb must be used within a DbProvider");
  }
  return context;
}
