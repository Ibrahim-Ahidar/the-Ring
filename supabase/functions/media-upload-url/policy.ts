// Size and type rules for encrypted media (spec section 9). Mirrors packages/core/src/media.ts;
// limits apply to the plaintext, so the stored object is allowed the AES-GCM overhead on top.
const MB = 1024 * 1024;
const IMAGE = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const FILE = ["application/pdf", "text/plain"];
const AUDIO = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg"];
export const AUDIO_MAX_MS = 180 * 1000;

/** Same layout as packages/core/src/e2ee-media/media-crypto.ts: 9-byte header, 16-byte tag per 64 KiB chunk. */
export function encryptedSize(plainSize: number): number {
  const chunks = Math.max(1, Math.ceil(plainSize / (64 * 1024)));
  return 9 + plainSize + chunks * 16;
}

/** Returns an error code, or null when an object of `sizeBytes` (encrypted) may be uploaded. */
export function validateUpload(mime: string, sizeBytes: number, durationMs?: number | null): string | null {
  const plainLimit = IMAGE.includes(mime)
    ? 8 * MB
    : FILE.includes(mime)
      ? 20 * MB
      : AUDIO.includes(mime)
        ? 8 * MB
        : null;
  if (plainLimit === null) return "media.unsupported_type";
  if (!Number.isInteger(sizeBytes) || sizeBytes < encryptedSize(0) || sizeBytes > encryptedSize(plainLimit)) {
    return "media.too_large";
  }
  if (AUDIO.includes(mime) && durationMs != null && durationMs > AUDIO_MAX_MS) return "media.too_long";
  return null;
}
