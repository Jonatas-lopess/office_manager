import { DB } from "@vlcn.io/crsqlite-wasm";
import { useEffect, useRef, useState } from "react";

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

export function useSyncBridge(ctx: DB, wsUrl: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const lastVersionRef = useRef(0n);
  const [connectedPeers, setConnectedPeers] = useState([]);

  // ==========================================
  // EFFECT 1: MANAGE THE NETWORK CONNECTION
  // ==========================================
  useEffect(() => {
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => console.log(`🟢 [Network] Connected to Hub`);
    ws.onerror = (err) => console.error(`🔴 [Network] Socket Error:`, err);

    ws.onmessage = async (event) => {
      const mySiteIdStr = (
        await ctx.execA("SELECT crsql_site_id()")
      )[0][0].join(",");
      const message = deserializeMsg(event.data);

      if (message.type === "presence") {
        console.log("👥 [Roster Update]:", message.payload);
        setConnectedPeers(message.payload);
        return; // Stop here, this isn't database info
      }

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
              const incomingSiteIdStr = row[6].join(","); // site_id is index 6
              if (incomingSiteIdStr === mySiteIdStr) {
                console.warn(`⚠️ [Inbound] Skipping change from self`);
                continue; // Skip changes originating from this site
              }

              stmt.run(tx, row).catch((err) => {
                console.error(`❌ [Inbound SQL Error]:`, err);
                console.error(`Failing Row Data:`, row);

                throw err; // Rethrow to abort the transaction
              });
            }

            if (message.payload[0][6].join(",") !== mySiteIdStr)
              console.log(`✅ [Inbound] Merged remote changes!`);
          })
          .catch((err) => {
            console.error(`❌ [Transaction Error]:`, err);
          });

        stmt.finalize(null);
      }
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      } else {
        ws.onopen = () => ws.close();
      }
    };
  }, [wsUrl, ctx]); // Reconnect if the URL or DB context changes

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

  return { connectedPeers };
}
