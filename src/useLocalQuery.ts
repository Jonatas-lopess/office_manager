import { DB } from "@vlcn.io/crsqlite-wasm";
import { useState, useEffect } from "react";

export function useLocalQuery(ctx: DB, query: string, params: any[] = []) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Safety check: don't run if the database hasn't booted yet
    if (!ctx || !ctx.db) return;

    let isMounted = true;

    const fetchData = async () => {
      try {
        // execO runs the SQL and returns an array of JSON objects
        const result = await ctx.execO(query, params);

        if (isMounted) {
          setData(result);
          setLoading(false);
          setError(null);
        }
      } catch (err: any) {
        console.error("SQL Execution Error:", err, "\nQuery:", query);
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      }
    };

    // 1. Fetch the data instantly on mount
    fetchData();

    // 2. Listen natively to the SQLite database.
    // Anytime ANY write happens (local or synced via WebSocket), re-run the fetch!
    const cleanup = ctx.onUpdate(() => {
      fetchData();
    });

    return () => {
      isMounted = false;
      cleanup(); // Remove the listener when the component unmounts
    };
    // We stringify the params array so React doesn't trigger infinite loops
  }, [ctx, query, JSON.stringify(params)]);

  return { data, loading, error };
}
