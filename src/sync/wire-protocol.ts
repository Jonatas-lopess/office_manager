// ==========================================
// WIRE PROTOCOL
// Shared office secret, site-id encoding, and the custom JSON
// serializers that safely package bytes and BigInts for the network.
// ==========================================

// Shared office secret. Must be identical on every device — the hub rejects
// the WS upgrade for anyone who doesn't present it (see src-tauri/src/lib.rs).
export const SYNC_TOKEN = import.meta.env.VITE_SYNC_TOKEN || "";
if (!SYNC_TOKEN) {
  console.warn(
    "⚠️ [Sync] VITE_SYNC_TOKEN is not set — this device cannot join or host the sync network until it's configured (see .env).",
  );
}

export const SITE_ID_HEX_RE = /^[0-9a-fA-F]{32}$/;

// A 16-byte site_id, hex-encoded, is the only shape crsql_site_id() ever
// produces locally. Reject anything else instead of trusting it — these
// values can originate in a message sent by another device on the network.
export function siteIdHexToBytes(hex: string): Uint8Array | null {
  if (!SITE_ID_HEX_RE.test(hex)) return null;
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function serializeMsg(msg: any): string {
  return JSON.stringify(msg, (_, value) => {
    if (typeof value === "bigint") {
      return { __type: "bigint", value: value.toString() };
    }
    if (value instanceof Uint8Array || value?.buffer instanceof ArrayBuffer) {
      return { __type: "uint8array", value: Array.from(new Uint8Array(value)) };
    }
    return value;
  });
}

export function deserializeMsg(str: any): any {
  return JSON.parse(str, (_, value) => {
    if (value && value.__type === "bigint") {
      return BigInt(value.value);
    }
    if (value && value.__type === "uint8array") {
      return new Uint8Array(value.value);
    }
    return value;
  });
}
