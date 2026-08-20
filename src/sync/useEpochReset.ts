import { DB } from "@vlcn.io/crsqlite-wasm";
import { useCallback, useEffect, useRef, useState } from "react";
import { resolveEpochConflict } from "./epoch";
import { MessageListener, SendFn } from "./types";

const CLEARABLE_TABLES = [
  "payments",
  "service_tags",
  "services",
  "tags",
  "clients",
  "logs",
];

/**
 * Owns sync-epoch state and the wipe routine that adopts a new one.
 * `send`/`disconnect`/`reconnect` and `onMessage` come from
 * useHubConnection explicitly — no shared refs crossing hook boundaries.
 */
export function useEpochReset(
  ctx: DB,
  send: SendFn,
  disconnect: () => void,
  reconnect: () => void,
  onMessage: (listener: MessageListener) => () => void,
  setSyncFinished: (finished: boolean) => void,
) {
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

  const isWipingRef = useRef(false);

  const performLocalWipeAndAdoptEpoch = useCallback(
    async (newEpoch: string) => {
      if (isWipingRef.current) {
        console.log("⏳ [Sync] Local wipe already in progress. Skipping.");
        return;
      }
      isWipingRef.current = true;
      setSyncFinished(false);

      // Go offline before wiping to prevent stale sync during the process
      disconnect();

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

        // Clear the global changes table and rotate site ID to ensure a fresh identity in the new epoch.
        // crsql_site_id() is read-only (fixed argc=0 in the extension) and its value is cached
        // in-memory per connection from this table's ordinal=0 row at connection-open time — updating
        // the row only takes effect on the NEXT fresh connection, hence the reload below.
        await ctx.exec(`DELETE FROM crsql_changes`);
        await ctx.exec(
          `UPDATE crsql_site_id SET site_id = randomblob(16) WHERE ordinal = 0`,
        );

        localStorage.setItem("sync_epoch", newEpoch);

        console.log(
          `✅ [Sync] Clean wipe complete. Reloading to adopt new identity under epoch: ${newEpoch}`,
        );
        window.location.reload();
      } catch (err) {
        console.error(
          "❌ [Sync] Failed to perform local wipe on epoch mismatch:",
          err,
        );
      } finally {
        isWipingRef.current = false;
      }
    },
    [ctx, disconnect, setSyncFinished],
  );

  const handleEpochMessage = useCallback(
    (remoteEpochStr: string | undefined, sendFn: SendFn) =>
      resolveEpochConflict(remoteEpochStr, {
        localEpoch: epochRef.current,
        onWipe: performLocalWipeAndAdoptEpoch,
        onSendCorrective: (localEpoch) =>
          sendFn({ type: "epoch_reset", payload: { epoch: localEpoch } }),
      }),
    [performLocalWipeAndAdoptEpoch],
  );

  // Inbound epoch_reset announcements from peers.
  useEffect(() => {
    return onMessage((message, sendFn) => {
      if (message.type !== "epoch_reset") return;
      void handleEpochMessage(message.payload?.epoch, sendFn);
    });
  }, [onMessage, handleEpochMessage]);

  const resetSyncEpoch = useCallback(
    (newEpoch: string) => {
      localStorage.setItem("sync_epoch", newEpoch);
      setEpoch(newEpoch);
      epochRef.current = newEpoch;
      send({ type: "epoch_reset", payload: { epoch: newEpoch } });
      reconnect();
    },
    [send, reconnect],
  );

  return { epoch, epochRef, handleEpochMessage, resetSyncEpoch };
}
