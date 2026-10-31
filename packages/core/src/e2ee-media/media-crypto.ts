// Chunked AES-256-GCM for encrypted media (spec section 9). WebCrypto only, no primitives of
// our own. Object layout: version(1) | nonce prefix(8) | chunk*, each chunk = ciphertext + 16-byte tag.
// IV = prefix | chunk counter (4 bytes BE). AAD = counter | final-flag, so reordering,
// dropping or truncating chunks fails authentication.
import { err, ok, type Result } from "../result";

export const MEDIA_CHUNK_SIZE = 64 * 1024;
const VERSION = 1;
const PREFIX_LEN = 8;
const HEADER_LEN = 1 + PREFIX_LEN;
const TAG_LEN = 16;

export type EncryptedMedia = {
  /** Bytes stored in R2: header plus sealed chunks. */
  ciphertext: Uint8Array;
  /** Raw 32-byte file key. */
  key: Uint8Array;
  /** Lowercase hex SHA-256 of `ciphertext` (the stored object). */
  sha256: string;
};

/** Size of the stored object for a plaintext of `plainSize` bytes. */
export function encryptedSize(plainSize: number): number {
  const chunks = Math.max(1, Math.ceil(plainSize / MEDIA_CHUNK_SIZE));
  return HEADER_LEN + plainSize + chunks * TAG_LEN;
}

/** Fresh random 32-byte file key (spec 9.1). */
export function generateMediaKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

function bs(a: Uint8Array): ArrayBuffer {
  return a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength) as ArrayBuffer;
}

function chunkParams(prefix: Uint8Array, counter: number, final: boolean) {
  const iv = new Uint8Array(12);
  iv.set(prefix, 0);
  new DataView(iv.buffer).setUint32(8, counter, false);
  const aad = new Uint8Array(5);
  new DataView(aad.buffer).setUint32(0, counter, false);
  aad[4] = final ? 1 : 0;
  return { name: "AES-GCM", iv, additionalData: aad, tagLength: 128 } as const;
}

const importKey = (raw: Uint8Array, usage: "encrypt" | "decrypt") =>
  crypto.subtle.importKey("raw", bs(raw), "AES-GCM", false, [usage]);

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", bs(data)));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Encrypts `plain` in 64 KiB chunks with `key` (a new key when omitted). */
export async function encryptMedia(plain: Uint8Array, key = generateMediaKey()): Promise<EncryptedMedia> {
  if (key.length !== 32) throw new Error("media.bad_key");
  const ck = await importKey(key, "encrypt");
  const prefix = crypto.getRandomValues(new Uint8Array(PREFIX_LEN));
  const out = new Uint8Array(encryptedSize(plain.length));
  out[0] = VERSION;
  out.set(prefix, 1);
  const chunks = Math.max(1, Math.ceil(plain.length / MEDIA_CHUNK_SIZE));
  let pos = HEADER_LEN;
  for (let i = 0; i < chunks; i++) {
    const part = plain.subarray(i * MEDIA_CHUNK_SIZE, (i + 1) * MEDIA_CHUNK_SIZE);
    const sealed = new Uint8Array(
      await crypto.subtle.encrypt(chunkParams(prefix, i, i === chunks - 1), ck, bs(part)),
    );
    out.set(sealed, pos);
    pos += sealed.length;
  }
  return { ciphertext: out, key, sha256: await sha256Hex(out) };
}

/**
 * Checks the SHA-256 of the stored object (when given), then authenticates and decrypts every
 * chunk. Errors: media.hash_mismatch, media.corrupt (tampered, truncated, wrong key).
 */
export async function decryptMedia(
  ciphertext: Uint8Array,
  key: Uint8Array,
  expectedSha256?: string,
): Promise<Result<Uint8Array>> {
  if (expectedSha256 !== undefined && (await sha256Hex(ciphertext)) !== expectedSha256.toLowerCase()) {
    return err("media.hash_mismatch");
  }
  if (key.length !== 32 || ciphertext.length < HEADER_LEN + TAG_LEN || ciphertext[0] !== VERSION) {
    return err("media.corrupt");
  }
  const prefix = ciphertext.subarray(1, HEADER_LEN);
  const body = ciphertext.subarray(HEADER_LEN);
  const sealedChunk = MEDIA_CHUNK_SIZE + TAG_LEN;
  const chunks = Math.ceil(body.length / sealedChunk);
  const lastLen = body.length - (chunks - 1) * sealedChunk;
  if (lastLen < TAG_LEN) return err("media.corrupt");
  const ck = await importKey(key, "decrypt");
  const plain = new Uint8Array(body.length - chunks * TAG_LEN);
  let pos = 0;
  try {
    for (let i = 0; i < chunks; i++) {
      const part = body.subarray(i * sealedChunk, (i + 1) * sealedChunk);
      const dec = new Uint8Array(
        await crypto.subtle.decrypt(chunkParams(prefix, i, i === chunks - 1), ck, bs(part)),
      );
      plain.set(dec, pos);
      pos += dec.length;
    }
  } catch {
    return err("media.corrupt");
  }
  return ok(plain);
}

export function bytesToB64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
