import { DB } from "@vlcn.io/crsqlite-wasm";
import { MutableRefObject, useCallback, useEffect, useRef } from "react";
import { DBChangeHub } from "@/db/change-hub";
import { ConnectionStatus, MessageListener, SendFn } from "./types";
import { siteIdHexToBytes } from "./wire-protocol";

const SYNC_BATCH_SIZE = 1000; // Optimal for balancing latency and throughput

// If a resync round-trip doesn't shrink the number of sites we're behind on,
// count it as stalled. After this many stalled rounds in a row, stop
// resending request_sync — a non-shrinking gap under concurrent writes can
// otherwise ping-pong forever (SYNC_REFACTOR_PLAN.md achado #3). The arrival
// debounce still resolves isInitialSyncFinished once writes settle, so the
// UI won't hang even if convergence didn't fully complete.
const MAX_STALLED_REQUEST_SYNC_RETRIES = 3;

export interface UseAntiEntropySyncOptions {
  ctx: DB;
  hub: DBChangeHub;
  send: SendFn;
  connectionStatus: ConnectionStatus;
  isolatedMode: boolean;
  onMessage: (listener: MessageListener) => () => void;
  epochRef: MutableRefObject<string>;
  handleEpochMessage: (
    remoteEpochStr: string | undefined,
    send: SendFn,
  ) => Promise<boolean>;
  siteId?: Uint8Array;
  siteIdHex?: string;
  initialVersion?: bigint;
  setSyncFinished: (finished: boolean) => void;
  isInitialSyncFinishedRef: MutableRefObject<boolean>;
}

/**
 * Handles request_sync/sync protocol messages (anti-entropy) and pushes
 * local writes up to the hub as they happen. Epoch conflicts are checked
 * via the shared `handleEpochMessage` from useEpochReset rather than
 * duplicating that logic here.
 */
export function useAntiEntropySync({
  ctx,
  hub,
  send,
  connectionStatus,
  isolatedMode,
  onMessage,
  epochRef,
  handleEpochMessage,
  siteId,
  siteIdHex,
  initialVersion,
  setSyncFinished,
  isInitialSyncFinishedRef,
}: UseAntiEntropySyncOptions) {
  const lastVersionRef = useRef(initialVersion ?? 0n);
  const isSyncingRef = useRef(false);
  const mySiteIdRef = useRef<Uint8Array | null>(siteId ?? null);
  const mySiteIdHexRef = useRef<string | null>(siteIdHex ?? null);

  const syncDebounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  // Tracks unfinished `ctx.tx()` writes from inbound "sync" batches, and whether
  // the arrival-debounce below has gone quiet — isInitialSyncFinished must wait
  // on BOTH, otherwise it flips true while batches are still being applied
  // (message arrival != write completion, since the tx() below isn't awaited).
  const pendingSyncWritesRef = useRef(0);
  const syncDebounceExpiredRef = useRef(false);
  const requestSyncGuardRef = useRef({
    lastMissingSites: Number.POSITIVE_INFINITY,
    stalledAttempts: 0,
  });

  const tryFinishInitialSync = useCallback(() => {
    if (
      syncDebounceExpiredRef.current &&
      pendingSyncWritesRef.current === 0 &&
      !isInitialSyncFinishedRef.current
    ) {
      setSyncFinished(true);
    }
  }, [setSyncFinished, isInitialSyncFinishedRef]);

  const armSyncDebounce = useCallback(
    (delay: number) => {
      syncDebounceExpiredRef.current = false;
      if (syncDebounceTimeoutRef.current) {
        clearTimeout(syncDebounceTimeoutRef.current);
      }
      syncDebounceTimeoutRef.current = setTimeout(() => {
        syncDebounceExpiredRef.current = true;
        tryFinishInitialSync();
      }, delay);
    },
    [tryFinishInitialSync],
  );

  // Isolated mode never talks to a hub — nothing to wait on.
  useEffect(() => {
    if (isolatedMode) setSyncFinished(true);
  }, [isolatedMode, setSyncFinished]);

  // On (re)connect: announce our knowledge and kick off anti-entropy.
  useEffect(() => {
    if (connectionStatus !== "connected") return;

    requestSyncGuardRef.current = {
      lastMissingSites: Number.POSITIVE_INFINITY,
      stalledAttempts: 0,
    };

    (async () => {
      const knowledgeMap: Record<string, string> = {};
      try {
        const siteVersions = await ctx.execA(
          `SELECT hex(site_id), max(db_version) FROM crsql_changes GROUP BY site_id`,
        );
        for (const [sid, maxVersion] of siteVersions) {
          knowledgeMap[sid] = maxVersion.toString();
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
      send({
        type: "request_sync",
        payload: { knowledgeMap, epoch: epochRef.current },
      });

      // If we don't receive any sync messages within 1.5 seconds after connecting,
      // assume we are up to date or the hub has no data.
      armSyncDebounce(1500);
    })();
  }, [connectionStatus, ctx, send, epochRef, armSyncDebounce]);

  // Handle inbound request_sync / sync protocol messages.
  useEffect(() => {
    return onMessage(async (message, sendFn) => {
      if (message.type === "request_sync") {
        const remoteEpochStr = message.payload?.epoch;
        const wasConflict = await handleEpochMessage(remoteEpochStr, sendFn);
        if (wasConflict) return;

        const theirMap = message.payload?.knowledgeMap || {};
        if (!ctx) return;

        try {
          // Get all sites we know about
          const ourSites = await ctx.execA(
            `SELECT hex(site_id) FROM crsql_changes GROUP BY site_id`,
          );

          let allChanges: any[] = [];

          for (const [siteIdHexRow] of ourSites) {
            const siteIdBytes = siteIdHexToBytes(siteIdHexRow);
            if (!siteIdBytes) continue; // our own hex() output should always be valid; skip defensively

            const lastKnownVersion = theirMap[siteIdHexRow]
              ? BigInt(theirMap[siteIdHexRow])
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
              sendFn({ type: "sync", payload: batch });
              // Small yield to let UI remain responsive between batches if there are many
              if (allChanges.length > SYNC_BATCH_SIZE) {
                await new Promise((resolve) => setTimeout(resolve, 0));
              }
            }
          }

          // Anti-Entropy Check: Do they have stuff we don't?
          let missingSitesCount = 0;
          for (const siteIdHexKey in theirMap) {
            // theirMap is attacker-reachable (parsed straight from a peer's WS
            // message) — never let its keys anywhere near a SQL string.
            const siteIdBytes = siteIdHexToBytes(siteIdHexKey);
            if (!siteIdBytes) continue;

            const theirVersion = BigInt(theirMap[siteIdHexKey]);
            const ourRow = ourSites.find((s) => s[0] === siteIdHexKey);
            // If they have a site we don't know, or a newer version of a site we do know
            if (!ourRow) {
              missingSitesCount += 1;
              continue;
            }
            const [[ourMax]] = await ctx.execA(
              `SELECT max(db_version) FROM crsql_changes WHERE site_id = ?`,
              [siteIdBytes],
            );
            if (theirVersion > (ourMax || -1n)) {
              missingSitesCount += 1;
            }
          }

          if (missingSitesCount > 0) {
            const guard = requestSyncGuardRef.current;
            const isShrinking = missingSitesCount < guard.lastMissingSites;
            guard.lastMissingSites = missingSitesCount;
            guard.stalledAttempts = isShrinking ? 0 : guard.stalledAttempts + 1;

            if (guard.stalledAttempts > MAX_STALLED_REQUEST_SYNC_RETRIES) {
              console.warn(
                `⚠️ [Sync] request_sync isn't converging (stuck at ${missingSitesCount} missing sites). Halting resend loop.`,
              );
            } else {
              const siteVersions = await ctx.execA(
                `SELECT hex(site_id), max(db_version) FROM crsql_changes GROUP BY site_id`,
              );
              const myKnowledgeMap: Record<string, string> = {};
              for (const [sid, maxVersion] of siteVersions) {
                myKnowledgeMap[sid] = maxVersion.toString();
              }

              // Ensure our own site is always included
              if (
                mySiteIdHexRef.current &&
                !(mySiteIdHexRef.current in myKnowledgeMap)
              ) {
                myKnowledgeMap[mySiteIdHexRef.current] =
                  lastVersionRef.current.toString();
              }

              sendFn({
                type: "request_sync",
                payload: {
                  knowledgeMap: myKnowledgeMap,
                  epoch: epochRef.current,
                },
              });
            }
          } else {
            // Anti-entropy determined we are fully up to date with this request.
            // Still gated on pendingSyncWritesRef — earlier "sync" batches may
            // still be mid-write even though nothing further is being requested.
            if (!isInitialSyncFinishedRef.current) {
              if (syncDebounceTimeoutRef.current) {
                clearTimeout(syncDebounceTimeoutRef.current);
              }
              syncDebounceExpiredRef.current = true;
              tryFinishInitialSync();
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

        pendingSyncWritesRef.current += 1;
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
                  (byte: number, i: number) => byte === mySiteIdRef.current![i],
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
            pendingSyncWritesRef.current -= 1;
            tryFinishInitialSync();
          });

        // Reset the debounce timer on every received sync message
        if (!isInitialSyncFinishedRef.current) {
          armSyncDebounce(1000);
        }
      }
    });
  }, [
    ctx,
    onMessage,
    handleEpochMessage,
    epochRef,
    tryFinishInitialSync,
    armSyncDebounce,
    isInitialSyncFinishedRef,
  ]);

  // Push local writes up to the hub as they happen.
  useEffect(() => {
    if (!ctx) return;

    // Subscribing via the multiplexing Hub to avoid conflicting with other listeners
    const unsubscribe = hub.subscribe(async () => {
      if (isSyncingRef.current) return;
      if (connectionStatus !== "connected") return;

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
            send({ type: "sync", payload: batch });

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
  }, [ctx, hub, send, connectionStatus]);
}
