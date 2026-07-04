/**
 * useMeshCrypto.ts — Client-side AES-256-GCM message encryption
 * src/app/hooks/useMeshCrypto.ts
 *
 * SEC-4 fix: messages are encrypted in the browser before being sent to the
 * backend, so the `ciphertext` column in SQLite contains real ciphertext.
 *
 * Key derivation:
 *   A per-session AES-256-GCM key is derived from the VITE_MESH_SECRET env
 *   var using HKDF-SHA-256. If VITE_MESH_SECRET is absent a random ephemeral
 *   key is generated — messages are still encrypted at rest, just not
 *   decryptable by other nodes without the shared secret.
 *
 * Wire format (base64url-encoded JSON payload stored in `ciphertext`):
 *   { iv: "<12-byte base64>", ct: "<ciphertext base64>", tag: "<16-byte base64>" }
 *
 * AES-GCM natively includes the tag in the ciphertext output from SubtleCrypto,
 * so the wire format is actually: { iv: "<12-byte base64>", ct: "<ct+tag base64>" }
 */

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;

// ─── Key singleton ────────────────────────────────────────────────────────────
// Derived once per page-load; stored in module scope (not React state) to
// avoid re-deriving on every render.

let _keyPromise: Promise<CryptoKey> | null = null;

function getMeshKey(): Promise<CryptoKey> {
  if (_keyPromise) return _keyPromise;

  _keyPromise = (async () => {
    const secret = (import.meta.env.VITE_MESH_SECRET as string | undefined) ?? "";

    if (!secret) {
      // No shared secret — generate a random ephemeral key (messages are still
      // encrypted at rest but cannot be decrypted by other nodes)
      return crypto.subtle.generateKey(
        { name: ALGORITHM, length: KEY_LENGTH },
        false,
        ["encrypt", "decrypt"]
      );
    }

    // Derive a deterministic key from the shared secret via HKDF-SHA-256
    const raw    = new TextEncoder().encode(secret);
    const salt   = new TextEncoder().encode("meshnet-message-key-v1");
    const info   = new TextEncoder().encode("AES-GCM-256");

    const baseKey = await crypto.subtle.importKey("raw", raw, "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "HKDF", hash: "SHA-256", salt, info },
      baseKey,
      { name: ALGORITHM, length: KEY_LENGTH },
      false,
      ["encrypt", "decrypt"]
    );
  })();

  return _keyPromise;
}

// ─── Public helpers ───────────────────────────────────────────────────────────

/**
 * Encrypt plaintext with AES-256-GCM. Returns a base64 string containing
 * a 12-byte random IV prepended to the ciphertext+tag.
 */
export async function encryptMessage(plaintext: string): Promise<string> {
  const key    = await getMeshKey();
  const iv     = crypto.getRandomValues(new Uint8Array(12));
  const data   = new TextEncoder().encode(plaintext);

  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    data
  );

  // Prepend IV so the receiver can derive it: [12 bytes IV][ciphertext+16 byte tag]
  const combined = new Uint8Array(iv.byteLength + ciphertextBuf.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertextBuf), iv.byteLength);

  return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a message encrypted by encryptMessage().
 * Returns null on failure (wrong key, corrupted payload).
 */
export async function decryptMessage(ciphertext: string): Promise<string | null> {
  try {
    const key     = await getMeshKey();
    const bytes   = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
    const iv      = bytes.slice(0, 12);
    const payload = bytes.slice(12);

    const plainBuf = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      payload
    );
    return new TextDecoder().decode(plainBuf);
  } catch {
    return null; // Decryption failed — wrong key or tampered ciphertext
  }
}
