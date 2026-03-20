import { DB } from "@vlcn.io/crsqlite-wasm";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";

const BASE_RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;
const JITTER_AMOUNT = 500;
const SYNC_BATCH_SIZE = 1000; // Optimal for balancing latency and throughput

// ==========================================
// CUSTOM JSON SERIALIZERS
// Safely packages bytes and BigInts for the network
// ==========================================
const serializeMsg = (msg: any) => {
  return JSON.stringify(msg, (_, value) => {
    if (typeof value === "bigint") {
      return { __type: "bigint", value: value.toString() };
    }
    if (value instanceof Uint8Array || value?.buffer instanceof ArrayBuffer) {
      return { __type: "uint8array", value: Array.from(new Uint8Array(value)) };
    }
    return value;
  });
};

const deserializeMsg = (str: any) => {
  return JSON.parse(str, (_, value) => {
    if (value && value.__type === "bigint") {
      return BigInt(value.value);
    }
    if (value && value.__type === "uint8array") {
      return new Uint8Array(value.value);
    }
    return value;
  });
};

/**
 * Compares two Uint8Arrays for equality.
 * Returns true if they are identical, false otherwise.
 */
function compareUint8Arrays(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

export interface Peer {
  id: string;
  ip: string;
}

import { DBChangeHub } from "@/db/change-hub";

export function useSyncBridge(
  ctx: DB,
  hub: DBChangeHub,
  initialHubUrl: string,
  isTauri: boolean,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const lastVersionRef = useRef(0n);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const isUnmountingRef = useRef(false);
  const isSyncingRef = useRef(false);

  const [myId, setMyId] = useState<string | null>(null);
  const [connectedPeers, setConnectedPeers] = useState<Peer[]>([]);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [isInitialSyncFinished, setIsInitialSyncFinished] = useState(false);
  const isInitialSyncFinishedRef = useRef(false);
  const syncDebounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const setSyncFinished = useCallback((finished: boolean) => {
    setIsInitialSyncFinished(finished);
    isInitialSyncFinishedRef.current = finished;
  }, []);


  // ==========================================
  // EFFECT 1: MANAGE THE NETWORK CONNECTION
  // ==========================================
  const connect = useCallback(async () => {
    if (isUnmountingRef.current) return;

    // Clean up any existing connections or timers
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.close();
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    setConnectionStatus(
      reconnectAttemptsRef.current > 0 ? "reconnecting" : "connecting",
    );

    let targetUrl: string;
    // On the very first attempt, use the initial URL provided to the hook.
    if (reconnectAttemptsRef.current === 0) {
      targetUrl = initialHubUrl;
    } else {
      // On subsequent attempts (failover), scan the network for a new Hub.
      try {
        let hubIp: string | null = null;
        if (isTauri) {
          console.log(`❌ [Failover] Scanning for a new Hub...`);
          hubIp = await invoke<string | null>("find_hub_ip");
        }
        if (hubIp) {
          console.log(`✅ [Failover] Found new Hub at ${hubIp}`);
          targetUrl = `ws://${hubIp}:1234/ws`;
        } else {
          // If no hub is found, this instance becomes the hub.
          console.log(`❌ [Failover] No Hub found. Promoting self to Hub.`);
          targetUrl = `ws://localhost:1234/ws`;
        }
      } catch (e) {
        console.error(
          "❌ [Failover] Error scanning for Hub, will default to localhost.",
          e,
        );
        targetUrl = `ws://localhost:1234/ws`;
      }
    }

    // Guard: If the component unmounted while we were awaiting 'find_hub_ip', stop here.
    if (isUnmountingRef.current) return;

    console.log(`[Network] Attempting to connect to ${targetUrl}...`);
    const ws = new WebSocket(targetUrl);
    wsRef.current = ws;

    ws.onopen = async () => {
      if (isUnmountingRef.current) return;
      console.log(`🟢 [Network] Connected to Hub at ${targetUrl}`);
      setConnectionStatus("connected");
      reconnectAttemptsRef.current = 0;

      // Query local max versions per site for incremental sync
      const knowledgeMap: Record<string, string> = {
        // "hex_site_id": "max_version"
      };

      try {
        const siteVersions = await ctx.execA(
          `SELECT hex(site_id), max(db_version) FROM crsql_changes GROUP BY site_id`,
        );
        for (const [siteIdHex, maxVersion] of siteVersions) {
          knowledgeMap[siteIdHex] = maxVersion.toString();
        }
      } catch (err) {
        console.error(`❌ [Knowledge Map Error]:`, err);
      }

      // Asking peers to sync their history with us INCREMENTALLY
      ws.send(
        serializeMsg({
          type: "request_sync",
          payload: { knowledgeMap },
        }),
      );

      // If we don't receive any sync messages within 1.5 seconds after connecting,
      // assume we are up to date or the hub has no data.
      if (syncDebounceTimeoutRef.current) {
        clearTimeout(syncDebounceTimeoutRef.current);
      }
      syncDebounceTimeoutRef.current = setTimeout(() => {
        setSyncFinished(true);
      }, 1500);

    };

    ws.onerror = (err) => {
      console.error(`❌ [Network] Socket Error:`, err);
      // ws.onclose will be called next, which handles reconnection.
    };

    ws.onclose = () => {
      console.log(`⚠️ [Network] Disconnected from Hub.`);
      wsRef.current = null;

      // Do not attempt to reconnect if the component is unmounting.
      if (isUnmountingRef.current) {
        setConnectionStatus("disconnected");
        return;
      }

      setConnectionStatus("reconnecting");

      const attempts = reconnectAttemptsRef.current;
      // Exponential backoff with jitter
      const delay =
        Math.min(
          MAX_RECONNECT_DELAY,
          BASE_RECONNECT_DELAY * Math.pow(2, attempts),
        ) +
        Math.random() * JITTER_AMOUNT;

      console.log(
        `[Failover] Will attempt to reconnect in ${Math.round(
          delay / 1000,
        )}s (attempt #${attempts + 1})`,
      );

      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectAttemptsRef.current += 1;
        connect();
      }, delay);
    };

    ws.onmessage = async (event) => {
      const message = deserializeMsg(event.data);

      if (message.type === "identity") {
        setMyId(message.payload);
        return;
      }

      if (message.type === "presence") {
        setConnectedPeers(message.payload);
        return;
      }

      if (message.type === "request_sync") {
        const theirMap = message.payload?.knowledgeMap || {};

        if (!ctx) return;
        try {
          // Get all sites we know about
          const ourSites = await ctx.execA(
            `SELECT hex(site_id) FROM crsql_changes GROUP BY site_id`,
          );

          let allChanges: any[] = [];

          for (const [siteIdHex] of ourSites) {
            const lastKnownVersion = theirMap[siteIdHex]
              ? BigInt(theirMap[siteIdHex])
              : -1n;

            const changes = await ctx.execA(
              `SELECT "table", pk, cid, val, col_version, db_version, site_id, cl, seq
              FROM crsql_changes
              WHERE site_id = x'${siteIdHex}' AND db_version > ?
              ORDER BY db_version, seq`,
              [lastKnownVersion],
            );
            allChanges = allChanges.concat(changes);
          }

          if (allChanges.length > 0) {
            // Sort merged changes to maintain causal order across sites (best effort)
            allChanges.sort((a, b) => {
              const va = BigInt(a[5]);
              const vb = BigInt(b[5]);
              if (va < vb) return -1;
              if (va > vb) return 1;
              return Number(BigInt(a[8]) - BigInt(b[8])); // seq
            });

            // Send in batches to avoid blocking main thread and potential IPC limits
            for (let i = 0; i < allChanges.length; i += SYNC_BATCH_SIZE) {
              const batch = allChanges.slice(i, i + SYNC_BATCH_SIZE);
              ws.send(serializeMsg({ type: "sync", payload: batch }));
              // Small yield to let UI remain responsive between batches if there are many
              if (allChanges.length > SYNC_BATCH_SIZE) {
                await new Promise((resolve) => setTimeout(resolve, 0));
              }
            }
          }

          // Anti-Entropy Check: Do they have stuff we don't?
          let weAreMissingData = false;
          for (const siteIdHex in theirMap) {
            const theirVersion = BigInt(theirMap[siteIdHex]);
            const ourRow = ourSites.find((s) => s[0] === siteIdHex);
            // If they have a site we don't know, or a newer version of a site we do know
            if (!ourRow) {
              weAreMissingData = true;
              break;
            }
            // Need to get the actual max version for this site from our DB
            const [[ourMax]] = await ctx.execA(
              `SELECT max(db_version) FROM crsql_changes WHERE site_id = x'${siteIdHex}'`,
            );
            if (theirVersion > (ourMax || -1n)) {
              weAreMissingData = true;
              break;
            }
          }

          if (weAreMissingData) {
            const siteVersions = await ctx.execA(
              `SELECT hex(site_id), max(db_version) FROM crsql_changes GROUP BY site_id`,
            );
            const myKnowledgeMap: Record<string, string> = {};
            for (const [siteIdHex, maxVersion] of siteVersions) {
              myKnowledgeMap[siteIdHex] = maxVersion.toString();
            }
            ws.send(
              serializeMsg({
                type: "request_sync",
                payload: { knowledgeMap: myKnowledgeMap },
              }),
            );
          } else {
             // Anti-entropy determined we are fully up to date with this request
               if (!isInitialSyncFinishedRef.current) {
                 if (syncDebounceTimeoutRef.current) {
                   clearTimeout(syncDebounceTimeoutRef.current);
                 }
                 setSyncFinished(true);
               }
          }

        } catch (err) {
          console.error(`❌ [Outbound] Failed to fulfill request_sync:`, err);
        }
        return;
      }

      const mySiteId = new Uint8Array(
        (await ctx.execA("SELECT crsql_site_id()"))[0][0],
      );

      if (message.type === "sync" && message.payload.length > 0) {
        if (!ctx) {
          console.warn(`⚠️ [Inbound] Database context not ready, skipping.`);
          return;
        }

        const stmt = await ctx.prepare(
          `INSERT INTO crsql_changes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );

        ctx
          .tx(async (tx) => {
            for (const row of message.payload) {
              if (compareUint8Arrays(row[6], mySiteId)) {
                console.warn(`⚠️ [Inbound] Skipping change from self`);
                continue;
              }

              await stmt.run(tx, ...row).catch((err) => {
                console.error(`❌ [Inbound SQL Error]:`, err);
                console.error(`Failing Row Data:`, row);
                throw err;
              });
            }

              // Success merging remote changes
          })
          .catch((err) => {
            console.error(`❌ [Transaction Error]:`, err);
          })
          .finally(() => {
            stmt.finalize(null);
          });
          
        // Reset the debounce timer on every received sync message
        if (!isInitialSyncFinishedRef.current) {
          if (syncDebounceTimeoutRef.current) {
            clearTimeout(syncDebounceTimeoutRef.current);
          }
          syncDebounceTimeoutRef.current = setTimeout(() => {
            setSyncFinished(true);
          }, 1000);
        }

      }
    };
  }, [initialHubUrl, ctx, isTauri]);

  useEffect(() => {
    isUnmountingRef.current = false;
    connect();

    return () => {
      isUnmountingRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (syncDebounceTimeoutRef.current) {
        clearTimeout(syncDebounceTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.close();
      }
      setConnectionStatus("disconnected");
      setSyncFinished(false);
    };

  }, [connect]);

  // ==========================================
  // EFFECT 2: MANAGE THE DATABASE LISTENER
  // ==========================================
  useEffect(() => {
    if (!ctx) return;

    // Initialize local version tracker
    ctx
      .execA(
        `SELECT max(db_version) FROM crsql_changes WHERE site_id = crsql_site_id()`,
      )
      .then(([[maxV]]) => {
        const version = maxV ? BigInt(maxV) : 0n;
        console.log(`📑 [Init] Initializing version tracker to: ${version}`);
        lastVersionRef.current = version;
      })
      .catch((err) => {
        console.error(`❌ [Init] Failed to initialize version tracker:`, err);
      });

    // Subscribing via the multiplexing Hub to avoid conflicting with other listeners
    const unsubscribe = hub.subscribe(async () => {
      if (isSyncingRef.current) return;

      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      isSyncingRef.current = true;
      try {
        const changes = await ctx.execA(
          `SELECT "table", pk, cid, val, col_version, db_version, site_id, cl, seq
          FROM crsql_changes
          WHERE db_version > ? AND site_id = crsql_site_id()
          ORDER BY db_version, seq`,
          [lastVersionRef.current],
        );

        if (changes.length > 0) {
          lastVersionRef.current = changes[changes.length - 1][5];

          // Send in batches for better UI responsiveness and reliability
          for (let i = 0; i < changes.length; i += SYNC_BATCH_SIZE) {
            const batch = changes.slice(i, i + SYNC_BATCH_SIZE);
            ws.send(serializeMsg({ type: "sync", payload: batch }));

            if (changes.length > SYNC_BATCH_SIZE) {
              await new Promise((resolve) => setTimeout(resolve, 0));
            }
          }
        }
      } catch (err) {
        console.error(`❌ [Outbound SQL Error]:`, err);
      } finally {
        isSyncingRef.current = false;
      }
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [ctx, hub]);

  // ==========================================
  // EFFECT 3: LOG SERVER ERRORS
  // ==========================================
  useEffect(() => {
    const unlistenPromise = listen<string>("server-error", (event) => {
      console.error("❌ [Server Error] Server Start Error:", event.payload);
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  return { myId, connectedPeers, connectionStatus, isInitialSyncFinished };
}
