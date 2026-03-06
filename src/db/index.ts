import { drizzle } from "drizzle-orm/sqlite-proxy";
import { DB } from "@vlcn.io/crsqlite-wasm";
import * as schema from "./schema";

export const createDrizzle = (ctx: DB) => {
  return drizzle(
    async (sql, params) => {
      try {
        // Drizzle sends the SQL and params; we execute them in the WASM DB
        const rows = await ctx.execA(sql, params);
        // The proxy driver expects the result in this format
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
