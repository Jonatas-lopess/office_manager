// Application-layer encryption for sensitive text fields (currently just
// clients.gov_password). Keyed off the shared office sync token so every
// device that can join the LAN sync network can also decrypt what it
// receives from peers — see src/hooks/useSyncBridge.ts for the same token.
const SYNC_TOKEN = import.meta.env.VITE_SYNC_TOKEN || "";
if (!SYNC_TOKEN) {
  console.warn(
    "⚠️ [Crypto] VITE_SYNC_TOKEN is not set — encrypted fields will be stored in plain text until it's configured (see .env).",
  );
}

const PREFIX = "v1:";
const SALT = new TextEncoder().encode("managerdesk.secret-field.v1");
const INFO = new TextEncoder().encode("secret-field-aes-gcm-256");

let keyPromise: Promise<CryptoKey> | null = null;

function getKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = crypto.subtle
      .importKey("raw", new TextEncoder().encode(SYNC_TOKEN), "HKDF", false, [
        "deriveKey",
      ])
      .then((baseKey) =>
        crypto.subtle.deriveKey(
          { name: "HKDF", hash: "SHA-256", salt: SALT, info: INFO },
          baseKey,
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt", "decrypt"],
        ),
      );
  }
  return keyPromise;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encrypts a value for storage. Returns "" for empty input. */
export async function encryptSecret(
  plain: string | null | undefined,
): Promise<string> {
  if (!plain) return "";
  // Can't derive a key without the token — store as-is rather than fail the save.
  if (!SYNC_TOKEN) return plain;

  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plain),
  );

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return PREFIX + toBase64(combined);
}

/**
 * Decrypts a stored value. Values without the "v1:" prefix are legacy plain
 * text (written before this field was encrypted, or a device that had no
 * token configured) and are returned unchanged rather than treated as an error.
 */
export async function decryptSecret(
  stored: string | null | undefined,
): Promise<string> {
  if (!stored) return "";
  if (!stored.startsWith(PREFIX)) return stored;
  if (!SYNC_TOKEN) {
    console.warn(
      "⚠️ [Crypto] Cannot decrypt a stored secret: VITE_SYNC_TOKEN is not set on this device.",
    );
    return "";
  }

  try {
    const combined = fromBase64(stored.slice(PREFIX.length));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    const key = await getKey();
    const plainBytes = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext,
    );
    return new TextDecoder().decode(plainBytes);
  } catch (err) {
    console.error(
      "❌ [Crypto] Failed to decrypt a stored secret (wrong/missing token on this device?):",
      err,
    );
    return "";
  }
}
