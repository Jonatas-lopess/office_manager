import { DB } from "@vlcn.io/crsqlite-wasm";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";

const BASE_RECONNECT_DELAY = 1000; // 1 second
const MAX_RECONNECT_DELAY = 30000; // 30 seconds
const JITTER_AMOUNT = 500; // 0.5 seconds

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

export function useSyncBridge(
  ctx: DB,
  initialHubUrl: string,
  isTauri: boolean,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const lastVersionRef = useRef(0n);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const isUnmountingRef = useRef(false);

  const [connectedPeers, setConnectedPeers] = useState<string[]>([]);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");

  // ==========================================
  // EFFECT 1: MANAGE THE NETWORK CONNECTION
  // ==========================================
  const connect = useCallback(async () => {
    if (isUnmountingRef.current) return;

    // Clean up any existing connections or timers
    if (wsRef.current) {
      wsRef.current.onclose = null; // Prevent old onclose from firing
      wsRef.current.onerror = null; // Prevent old onerror from firing
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

    ws.onopen = () => {
      if (isUnmountingRef.current) return;
      console.log(`🟢 [Network] Connected to Hub at ${targetUrl}`);
      setConnectionStatus("connected");
      reconnectAttemptsRef.current = 0; // Reset on successful connection
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

      if (message.type === "presence") {
        console.log("👥 [Roster Update]:", message.payload);
        setConnectedPeers(message.payload);
        return;
      }

      const mySiteId = new Uint8Array(
        (await ctx.execA("SELECT crsql_site_id()"))[0][0],
      );

      if (message.type === "sync" && message.payload.length > 0) {
        console.log(
          `📥 [Inbound] Received ${message.payload.length} rows from network`,
        );

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

            if (!compareUint8Arrays(message.payload[0][6], mySiteId))
              console.log(`✅ [Inbound] Merged remote changes!`);
          })
          .catch((err) => {
            console.error(`❌ [Transaction Error]:`, err);
          })
          .finally(() => {
            stmt.finalize(null);
          });
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
      if (wsRef.current) {
        wsRef.current.onclose = null; // Prevent reconnect on unmount
        wsRef.current.onerror = null; // Prevent error logs on unmount
        wsRef.current.close();
      }
      setConnectionStatus("disconnected");
    };
  }, [connect]);

  // ==========================================
  // EFFECT 2: MANAGE THE DATABASE LISTENER
  // ==========================================
  useEffect(() => {
    if (!ctx) return;

    const cleanupOnUpdate = ctx.onUpdate(async () => {
      const ws = wsRef.current;

      // If the network isn't connected, we just silently skip sending.
      // The CRDT will naturally catch up on the next successful sync!
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      try {
        const changes = await ctx.execA(
          `SELECT "table", pk, cid, val, col_version, db_version, site_id, cl, seq
          FROM crsql_changes
          WHERE db_version > ? AND site_id = crsql_site_id()`,
          [lastVersionRef.current],
        );

        if (changes.length > 0) {
          console.log(
            `📤 [Outbound] Detected ${changes.length} local changes. Sending...`,
          );

          lastVersionRef.current = changes[changes.length - 1][5]; // db_version is index 5
          ws.send(serializeMsg({ type: "sync", payload: changes }));
        }
      } catch (err) {
        console.error(`❌ [Outbound SQL Error]:`, err);
      }
    });

    return () => {
      // Destroy the listener so we don't create "ghosts"
      if (typeof cleanupOnUpdate === "function") cleanupOnUpdate();
    };
  }, [ctx]);

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

  return { connectedPeers, connectionStatus };
}
