import { createContext, useContext, ReactNode } from "react";
import { DB } from "@vlcn.io/crsqlite-wasm";
import { DrizzleDB } from "./index";

export interface DbContextState {
  db: DB;
  orm: DrizzleDB;
}

const DbContext = createContext<DbContextState | null>(null);

export function DbProvider({
  db,
  orm,
  children,
}: DbContextState & { children: ReactNode }) {
  return (
    <DbContext.Provider value={{ db, orm }}>{children}</DbContext.Provider>
  );
}

export function useDb() {
  const context = useContext(DbContext);
  if (!context) {
    throw new Error("useDb must be used within a DbProvider");
  }
  return context;
}
