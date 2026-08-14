import crypto from "crypto";

/**
 * Symmetric encryption for secrets we must store but also read back in
 * plaintext to use — today, per-clinic WhatsApp access tokens
 * (`WhatsappConfig.accessTokenCipher`). This is reversible on purpose; it is
 * *not* password hashing.
 *
 * AES-256-GCM: authenticated, so a tampered ciphertext fails to decrypt rather
 * than yielding garbage. The key comes from `WHATSAPP_TOKEN_ENC_KEY` — 32 bytes
 * as base64 or hex (generate with `openssl rand -base64 32`). Losing or
 * rotating the key makes existing ciphertexts unreadable; the admin just
 * re-enters the token.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // GCM standard nonce size
const KEY_LENGTH = 32; // AES-256

/** Serialised form: `v1:<iv>:<authTag>:<ciphertext>`, all base64. The version
 *  prefix leaves room to rotate the scheme later without ambiguity. */
const PREFIX = "v1";

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.WHATSAPP_TOKEN_ENC_KEY;
  if (!raw) {
    throw new Error(
      "WHATSAPP_TOKEN_ENC_KEY is not set — cannot encrypt/decrypt WhatsApp tokens",
    );
  }

  // Accept either base64 or hex; both are common ways to write 32 random bytes.
  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    key = Buffer.from(raw, "base64");
  }

  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `WHATSAPP_TOKEN_ENC_KEY must decode to ${KEY_LENGTH} bytes (got ${key.length}) — generate one with \`openssl rand -base64 32\``,
    );
  }

  cachedKey = key;
  return key;
}

/** Encrypts a plaintext secret into the serialised `v1:iv:tag:ciphertext` form. */
export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    PREFIX,
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/** Reverses `encryptSecret`. Throws if the payload was tampered with or the
 *  key is wrong (GCM auth check). */
export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error("Malformed encrypted secret");
  }
  const [, ivB64, tagB64, dataB64] = parts;

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
