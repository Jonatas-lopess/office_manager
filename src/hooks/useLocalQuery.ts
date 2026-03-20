import { DB } from "@vlcn.io/crsqlite-wasm";
import { Query } from "drizzle-orm";
import { useSyncExternalStore, useState, useEffect, useMemo, useRef } from "react";
import { useDb } from "@/db/context";

export function useLocalQuery<T>(_ctx: DB, query: Query, enabled = true) {
  const { db: ctx, hub } = useDb();
  const versionRef = useRef(0);

  const store = useMemo(
    () => ({
      subscribe: (onStoreChange: () => void) => {
        if (!hub) return () => {};
        return hub.subscribe(() => {
          versionRef.current += 1;
          onStoreChange();
        });
      },
      getSnapshot: () => versionRef.current,
    }),
    [hub],
  );

  const dbVersion = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ctx || !enabled) {
      if (!enabled) {
        setData([]);
        setLoading(false);
      }
      return;
    }
    
    let ignore = false;
    setLoading(true);

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
  }, [ctx, query.sql, JSON.stringify(query.params), dbVersion, enabled]);

  return { data, loading, error };
}
