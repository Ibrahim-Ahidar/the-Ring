// Upload and download of encrypted media (spec section 9). The network is injected, so the
// same code runs on web and desktop and tests drive it against a fake R2.
import { err, ok, type Result } from "../result";
import type { MediaBody } from "../e2ee/plain-envelope";
import { b64ToBytes, bytesToB64, decryptMedia, encryptMedia } from "./media-crypto";

export type FetchFn = (
  url: string,
  init?: { method?: string; body?: Uint8Array; headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>;

export type UploadGrant = { url: string; key: string; headers?: Record<string, string> };

export type UploadRequest = {
  conversationId: string;
  mimeType: string;
  /** Size of the encrypted object, which the server limits and signs into the PUT. */
  sizeBytes: number;
  durationMs?: number | null;
};

export type EncryptedUploadInput = {
  conversationId: string;
  bytes: Uint8Array;
  mimeType: string;
  fileName?: string | null;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  caption?: string | null;
  /** Small preview image bytes; sealed with the file key and carried inline. */
  thumbnail?: Uint8Array | null;
  /** Calls the media-upload-url Edge Function. Errors use its codes (media.too_large, ...). */
  requestUploadUrl(req: UploadRequest): Promise<Result<UploadGrant>>;
  fetchFn: FetchFn;
};

/** Encrypts, asks for a pre-signed PUT link, uploads, and returns the body of the media message. */
export async function uploadEncryptedMedia(input: EncryptedUploadInput): Promise<Result<MediaBody>> {
  const enc = await encryptMedia(input.bytes);
  const grant = await input.requestUploadUrl({
    conversationId: input.conversationId,
    mimeType: input.mimeType,
    sizeBytes: enc.ciphertext.length,
    durationMs: input.durationMs ?? null,
  });
  if (!grant.ok) return grant;
  let res;
  try {
    res = await input.fetchFn(grant.value.url, {
      method: "PUT",
      body: enc.ciphertext,
      headers: { ...(grant.value.headers ?? {}), "Content-Type": "application/octet-stream" },
    });
  } catch {
    return err("media.upload_failed");
  }
  if (!res.ok) return err("media.upload_failed");
  let thumbnail: string | null = null;
  if (input.thumbnail && input.thumbnail.length > 0) {
    thumbnail = bytesToB64((await encryptMedia(input.thumbnail, enc.key)).ciphertext);
  }
  return ok({
    r2Key: grant.value.key,
    key: bytesToB64(enc.key),
    sha256: enc.sha256,
    mimeType: input.mimeType,
    size: input.bytes.length,
    fileName: input.fileName ?? null,
    width: input.width ?? null,
    height: input.height ?? null,
    durationMs: input.durationMs ?? null,
    thumbnail,
    caption: input.caption ?? null,
  });
}

export type DownloadInput = {
  conversationId: string;
  body: Pick<MediaBody, "r2Key" | "key" | "sha256">;
  /** Calls the media-upload-url Edge Function for a pre-signed GET link. */
  requestDownloadUrl(req: { conversationId: string; key: string }): Promise<Result<{ url: string }>>;
  fetchFn: FetchFn;
};

/**
 * Downloads, checks the SHA-256 of the stored object, then decrypts. A 404 means R2 already
 * deleted it: media.expired. A wrong hash is media.hash_mismatch, a bad chunk media.corrupt.
 */
export async function downloadDecryptedMedia(input: DownloadInput): Promise<Result<Uint8Array>> {
  const link = await input.requestDownloadUrl({
    conversationId: input.conversationId,
    key: input.body.r2Key,
  });
  if (!link.ok) return link;
  let res;
  try {
    res = await input.fetchFn(link.value.url, { method: "GET" });
  } catch {
    return err("media.download_failed");
  }
  if (res.status === 404) return err("media.expired");
  if (!res.ok) return err("media.download_failed");
  const stored = new Uint8Array(await res.arrayBuffer());
  return decryptMedia(stored, b64ToBytes(input.body.key), input.body.sha256);
}

/** Decrypts the inline thumbnail of a media message; null when absent or invalid. */
export async function openThumbnail(body: Pick<MediaBody, "key" | "thumbnail">): Promise<Uint8Array | null> {
  if (!body.thumbnail) return null;
  const res = await decryptMedia(b64ToBytes(body.thumbnail), b64ToBytes(body.key));
  return res.ok ? res.value : null;
}

/** Local state of a media message for rendering: expired media is shown as "media expired". */
export function mediaViewState(error: { code: string } | null): "ready" | "expired" | "failed" {
  if (!error) return "ready";
  return error.code === "media.expired" ? "expired" : "failed";
}
