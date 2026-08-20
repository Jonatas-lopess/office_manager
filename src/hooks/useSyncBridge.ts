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
import { getSiteMetadata } from "@/lib/utils";

const parseEpoch = (str: string): number => {
  if (str && /^\d+$/.test(str)) {
    return parseInt(str, 10);
  }
  return 0;
};

// Shared office secret. Must be identical on every device — the hub rejects
// the WS upgrade for anyone who doesn't present it (see src-tauri/src/lib.rs).
const SYNC_TOKEN = import.meta.env.VITE_SYNC_TOKEN || "";
if (!SYNC_TOKEN) {
  console.warn(
    "⚠️ [Sync] VITE_SYNC_TOKEN is not set — this device cannot join or host the sync network until it's configured (see .env).",
  );
}

const SITE_ID_HEX_RE = /^[0-9a-fA-F]{32}$/;

// A 16-byte site_id, hex-encoded, is the only shape crsql_site_id() ever
// produces locally. Reject anything else instead of trusting it — these
// values can originate in a message sent by another device on the network.
function siteIdHexToBytes(hex: string): Uint8Array | null {
  if (!SITE_ID_HEX_RE.test(hex)) return null;
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function useSyncBridge(
  ctx: DB,
  hub: DBChangeHub,
  initialHubUrl: string,
  isTauri: boolean,
  isolatedMode: boolean = false,
  siteId?: Uint8Array,
  siteIdHex?: string,
  initialVersion?: bigint,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const lastVersionRef = useRef(initialVersion ?? 0n);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const isUnmountingRef = useRef(false);
  const isConnectingRef = useRef(false);
  const isSyncingRef = useRef(false);
  const isWipingRef = useRef(false);
  const mySiteIdRef = useRef<Uint8Array | null>(siteId ?? null);
  const mySiteIdHexRef = useRef<string | null>(siteIdHex ?? null);

  const [myId, setMyId] = useState<string | null>(null);
  const [connectedPeers, setConnectedPeers] = useState<Peer[]>([]);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [isInitialSyncFinished, setIsInitialSyncFinished] = useState(false);
  const isInitialSyncFinishedRef = useRef(false);
  const syncDebounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const [epoch, setEpoch] = useState<string>(() => {
    let val = localStorage.getItem("sync_epoch");
    if (!val) {
      // A fresh install starts at epoch "0" so it adopts the network's epoch
      // instead of forcing the network to adopt a newer, empty epoch.
      val = "0";
      localStorage.setItem("sync_epoch", val);
    }
    return val;
  });
  const epochRef = useRef(epoch);

  useEffect(() => {
    epochRef.current = epoch;
  }, [epoch]);

  const performWipeRef = useRef<((newEpoch: string) => Promise<void>) | null>(
    null,
  );

  const setSyncFinished = useCallback((finished: boolean) => {
    setIsInitialSyncFinished(finished);
    isInitialSyncFinishedRef.current = finished;
  }, []);

  const initLocalState = useCallback(async () => {
    if (!ctx) return;
    try {
      // Initialize site identification and local version tracker
      const { siteId, siteIdHex, version } = await getSiteMetadata(ctx);
      mySiteIdRef.current = siteId;
      mySiteIdHexRef.current = siteIdHex;
      console.log(
        `📑 [Init] Site ID: ${siteIdHex}, version tracker: ${version}`,
      );
      lastVersionRef.current = version;
    } catch (err) {
      console.error(`❌ [Init] Failed to initialize sync parameters:`, err);
    }
  }, [ctx]);

  // ==========================================
  // EFFECT 1: MANAGE THE NETWORK CONNECTION
  // ==========================================
  const connect = useCallback(async () => {
    if (isUnmountingRef.current) return;
    if (isConnectingRef.current) {
      console.log(
        "⏳ [Network] Connection attempt already in progress. Skipping.",
      );
      return;
    }

    isConnectingRef.current = true;

    if (isolatedMode) {
      setConnectionStatus("disconnected");
      setSyncFinished(true);
      isConnectingRef.current = false;
      return;
    }

    try {
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

      let targetUrl: string = initialHubUrl;

      // On failover or initial connection as Tauri, we scan for a hub.
      if (isTauri && !isolatedMode) {
        console.log(`🔍 [Election] Scanning for an existing Hub...`);
        let hubIp = await invoke<string | null>("find_hub_ip");

        // Option B: Master Election retries
        if (!hubIp) {
          console.log(`⚠️ [Election] Scan 1 failed. Retrying...`);
          await new Promise((r) => setTimeout(r, 1000));
          hubIp = await invoke<string | null>("find_hub_ip");
        }
        if (!hubIp) {
          console.log(`⚠️ [Election] Scan 2 failed. Retrying...`);
          await new Promise((r) => setTimeout(r, 1000));
          hubIp = await invoke<string | null>("find_hub_ip");
        }

        if (isUnmountingRef.current) {
          isConnectingRef.current = false;
          return;
        }

        if (hubIp) {
          console.log(`✅ [Election] Found existing Hub at ${hubIp}`);
          targetUrl = `ws://${hubIp}:1234/ws`;
        } else {
          console.log(`❌ [Election] No Hub found. Electing SELF as Hub.`);
          try {
            await invoke("start_hub", { token: SYNC_TOKEN });
            // Wait briefly for Rust to bind port
            await new Promise((r) => setTimeout(r, 1500));
          } catch (err) {
            console.error("Failed to start local rust hub:", err);
          }
          targetUrl = `ws://localhost:1234/ws`;
        }
      }

      if (isUnmountingRef.current) {
        isConnectingRef.current = false;
        return;
      }

      const authedUrl = `${targetUrl}?token=${encodeURIComponent(SYNC_TOKEN)}`;
      console.log(`[Network] Attempting to connect to ${targetUrl}...`);
      const ws = new WebSocket(authedUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        isConnectingRef.current = false;
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

          // Ensure our own site is always included in the knowledge map
          if (
            mySiteIdHexRef.current &&
            !(mySiteIdHexRef.current in knowledgeMap)
          ) {
            knowledgeMap[mySiteIdHexRef.current] =
              lastVersionRef.current.toString();
          }
        } catch (err) {
          console.error(`❌ [Knowledge Map Error]:`, err);
        }

        // Asking peers to sync their history with us INCREMENTALLY
        ws.send(
          serializeMsg({
            type: "request_sync",
            payload: { knowledgeMap, epoch: epochRef.current },
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
        isConnectingRef.current = false;
        // ws.onclose will be called next, which handles reconnection.
      };

      ws.onclose = () => {
        isConnectingRef.current = false;
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

        if (message.type === "epoch_reset") {
          const remoteEpochStr = message.payload?.epoch;
          if (remoteEpochStr && remoteEpochStr !== epochRef.current) {
            const remoteEpoch = parseEpoch(remoteEpochStr);
            const localEpoch = parseEpoch(epochRef.current);
            if (remoteEpoch > localEpoch) {
              console.log(
                `🔄 [Sync] Received newer remote epoch reset to ${remoteEpochStr}. Wiping and resyncing...`,
              );
              if (performWipeRef.current) {
                await performWipeRef.current(remoteEpochStr);
              }
            } else {
              console.log(
                `🔄 [Sync] Received older remote epoch reset to ${remoteEpochStr}. Sending corrective reset...`,
              );
              ws.send(
                serializeMsg({
                  type: "epoch_reset",
                  payload: { epoch: epochRef.current },
                }),
              );
            }
          }
          return;
        }

        if (message.type === "request_sync") {
          const remoteEpochStr = message.payload?.epoch;
          if (remoteEpochStr && remoteEpochStr !== epochRef.current) {
            const remoteEpoch = parseEpoch(remoteEpochStr);
            const localEpoch = parseEpoch(epochRef.current);

            if (remoteEpoch > localEpoch) {
              console.log(
                `⚠️ [Sync] Remote epoch is newer in request_sync (us: ${localEpoch}, remote: ${remoteEpoch}). Wiping local data...`,
              );
              if (performWipeRef.current) {
                await performWipeRef.current(remoteEpochStr);
              }
            } else {
              console.log(
                `⚠️ [Sync] Local epoch is newer in request_sync (us: ${localEpoch}, remote: ${remoteEpoch}). Sending epoch_reset...`,
              );
              ws.send(
                serializeMsg({
                  type: "epoch_reset",
                  payload: { epoch: epochRef.current },
                }),
              );
            }
            return;
          }

          const theirMap = message.payload?.knowledgeMap || {};

          if (!ctx) return;
          try {
            // Get all sites we know about
            const ourSites = await ctx.execA(
              `SELECT hex(site_id) FROM crsql_changes GROUP BY site_id`,
            );

            let allChanges: any[] = [];

            for (const [siteIdHex] of ourSites) {
              const siteIdBytes = siteIdHexToBytes(siteIdHex);
              if (!siteIdBytes) continue; // our own hex() output should always be valid; skip defensively

              const lastKnownVersion = theirMap[siteIdHex]
                ? BigInt(theirMap[siteIdHex])
                : -1n;

              const changes = await ctx.execA(
                `SELECT "table", pk, cid, val, col_version, db_version, site_id, cl, seq
              FROM crsql_changes
              WHERE site_id = ? AND db_version > ?
              ORDER BY db_version, seq`,
                [siteIdBytes, lastKnownVersion],
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
              // theirMap is attacker-reachable (parsed straight from a peer's WS
              // message) — never let its keys anywhere near a SQL string.
              const siteIdBytes = siteIdHexToBytes(siteIdHex);
              if (!siteIdBytes) continue;

              const theirVersion = BigInt(theirMap[siteIdHex]);
              const ourRow = ourSites.find((s) => s[0] === siteIdHex);
              // If they have a site we don't know, or a newer version of a site we do know
              if (!ourRow) {
                weAreMissingData = true;
                break;
              }
              // Need to get the actual max version for this site from our DB
              const [[ourMax]] = await ctx.execA(
                `SELECT max(db_version) FROM crsql_changes WHERE site_id = ?`,
                [siteIdBytes],
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

              // Ensure our own site is always included
              if (
                mySiteIdHexRef.current &&
                !(mySiteIdHexRef.current in myKnowledgeMap)
              ) {
                myKnowledgeMap[mySiteIdHexRef.current] =
                  lastVersionRef.current.toString();
              }

              ws.send(
                serializeMsg({
                  type: "request_sync",
                  payload: {
                    knowledgeMap: myKnowledgeMap,
                    epoch: epochRef.current,
                  },
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
                await stmt.run(tx, ...row).catch((err) => {
                  console.error(`❌ [Inbound SQL Error]:`, err);
                  console.error(`Failing Row Data:`, row);
                  throw err;
                });

                // Update local version tracker if we receive our own changes back from another device
                if (
                  mySiteIdRef.current &&
                  row[6] instanceof Uint8Array &&
                  row[6].every(
                    (byte: number, i: number) =>
                      byte === mySiteIdRef.current![i],
                  )
                ) {
                  const rowVersion = BigInt(row[5]);
                  if (rowVersion > lastVersionRef.current) {
                    lastVersionRef.current = rowVersion;
                  }
                }
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
    } catch (e) {
      console.error("❌ [Network] Unexpected error in connect():", e);
      isConnectingRef.current = false;

      // Trigger a retry manually if we didn't even reach the WebSocket
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectAttemptsRef.current += 1;
        connect();
      }, BASE_RECONNECT_DELAY);
    }
  }, [initialHubUrl, ctx, isTauri, isolatedMode]);

  const resetSyncEpoch = useCallback(
    (newEpoch: string) => {
      localStorage.setItem("sync_epoch", newEpoch);
      setEpoch(newEpoch);
      epochRef.current = newEpoch;

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          serializeMsg({
            type: "epoch_reset",
            payload: { epoch: newEpoch },
          }),
        );
      }

      connect();
    },
    [connect],
  );

  const performLocalWipeAndAdoptEpoch = useCallback(
    async (newEpoch: string) => {
      if (isWipingRef.current) {
        console.log("⏳ [Sync] Local wipe already in progress. Skipping.");
        return;
      }
      isWipingRef.current = true;
      setSyncFinished(false);

      // Go offline before wiping to prevent stale sync during the process
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      isConnectingRef.current = false;

      const CLEARABLE_TABLES = [
        "payments",
        "service_tags",
        "services",
        "tags",
        "clients",
        "logs",
      ];

      try {
        console.log(`[Sync] Starting clean wipe for epoch ${newEpoch}...`);

        for (const tableName of CLEARABLE_TABLES) {
          await ctx.exec(`DELETE FROM "${tableName}"`);
          try {
            await ctx.exec(`DELETE FROM "${tableName}__crsql_clock"`);
          } catch (e) {
            console.warn(`Could not clear clock for ${tableName}:`, e);
          }
        }

        // Clear the global changes table and rotate site ID to ensure a fresh identity in the new epoch
        await ctx.exec(`DELETE FROM crsql_changes`);
        await ctx.exec(`SELECT crsql_site_id(randomblob(16))`);

        localStorage.setItem("sync_epoch", newEpoch);
        setEpoch(newEpoch);
        epochRef.current = newEpoch;

        // Reset local version tracker and identity refs
        await initLocalState();

        // Notify UI that tables are empty
        hub.broadcast();

        console.log(
          `✅ [Sync] Clean wipe complete. Reconnecting under new epoch: ${newEpoch}`,
        );
        connect();
      } catch (err) {
        console.error(
          "❌ [Sync] Failed to perform local wipe on epoch mismatch:",
          err,
        );
      } finally {
        isWipingRef.current = false;
      }
    },
    [ctx, connect, setSyncFinished, initLocalState, hub],
  );

  useEffect(() => {
    performWipeRef.current = performLocalWipeAndAdoptEpoch;
  }, [performLocalWipeAndAdoptEpoch]);

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

  return {
    myId,
    connectedPeers,
    connectionStatus,
    isInitialSyncFinished,
    resetSyncEpoch,
  };
}
