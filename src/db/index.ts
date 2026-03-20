import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";
import initWasm, { DB } from "@vlcn.io/crsqlite-wasm";
import { runMigrations } from "./migrator";
import wasmUrl from "@vlcn.io/crsqlite-wasm/crsqlite.wasm?url";

const createDrizzle = (ctx: DB) => {
  return drizzle(
    async (sql, params, method) => {
      try {
        if (method === "all" || method === "values") {
          const rows = await ctx.execA(sql, params);
          return { rows };
        }
        if (method === "get") {
          const rows = await ctx.execA(sql, params);
          return { rows: rows[0] };
        }
        if (method === "run") {
          await ctx.exec(sql, params);
          const changes = await ctx.execA("SELECT changes()");
          const lastRowId = await ctx.execA("SELECT last_insert_rowid()");
          return {
            rows: {
              insertId: Number(lastRowId[0][0]),
              changes: Number(changes[0][0]),
            },
          } as any;
        }

        const rows = await ctx.execA(sql, params);
        return { rows };
      } catch (e) {
        console.error("Error executing Drizzle query:", e);
        throw e;
      }
    },
    { schema },
  );
};

import { DBChangeHub } from "./change-hub";

export type DrizzleDB = ReturnType<typeof createDrizzle>;

export async function initDb(): Promise<{
  db: DB;
  orm: DrizzleDB;
  hub: DBChangeHub;
}> {
  const crsqlite = await initWasm(() => wasmUrl);
  const db = await crsqlite.open("my_local_database.db");

  await runMigrations(db);

  const orm = createDrizzle(db);
  const hub = new DBChangeHub(db);
  return { db, orm, hub };
}
