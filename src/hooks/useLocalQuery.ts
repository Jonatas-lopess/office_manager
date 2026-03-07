import { DB } from "@vlcn.io/crsqlite-wasm";
import { Query } from "drizzle-orm";
import { useSyncExternalStore, useState, useEffect, useMemo } from "react";

export function useLocalQuery<T>(ctx: DB, query: Query) {
  // Use a simple counter to track database updates
  const [dbVersion, setDbVersion] = useState(0);

  // 1. Define the Store
  const store = useMemo(
    () => ({
      subscribe: (onStoreChange: () => void) => {
        if (!ctx) return () => {};
        // ctx.onUpdate returns a cleanup function
        return ctx.onUpdate(() => {
          setDbVersion((prev) => prev + 1);
          onStoreChange();
        });
      },
      getSnapshot: () => dbVersion,
    }),
    [ctx],
  );

  // 2. Subscribe using the React 19 standard
  useSyncExternalStore(store.subscribe, store.getSnapshot);

  // 3. Data Fetching Logic
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ctx) return;
    let ignore = false;

    const fetchData = async () => {
      try {
        const result = await ctx.execO(query.sql, query.params as any[]);

        if (!ignore) {
          setData(result as T[]);
          setLoading(false);
          setError(null);
        }
      } catch (err: any) {
        if (!ignore) {
          setError(err.message);
          setLoading(false);
        }
      }
    };

    fetchData();
    return () => {
      ignore = true;
    };
  }, [ctx, query.sql, ...query.params, dbVersion]);

  return { data, loading, error };
}
