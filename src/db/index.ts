import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";
import initWasm, { DB } from "@vlcn.io/crsqlite-wasm";
import { runMigrations } from "./migrator";
import wasmUrl from "@vlcn.io/crsqlite-wasm/crsqlite.wasm?url";

const createDrizzle = (ctx: DB) => {
  return drizzle(
    async (sql, params) => {
      try {
        const rows = await ctx.execO(sql, params);

        return { rows };
      } catch (e) {
        console.error("Error executing Drizzle query:", e);
        throw e;
      }
    },
    { schema },
  );
};

export type DrizzleDB = ReturnType<typeof createDrizzle>;

export async function initDb(): Promise<{ db: DB; orm: DrizzleDB }> {
  const crsqlite = await initWasm(() => wasmUrl);
  const db = await crsqlite.open("my_local_database.db");

  await runMigrations(db);

  const orm = createDrizzle(db);
  return { db, orm };
}
