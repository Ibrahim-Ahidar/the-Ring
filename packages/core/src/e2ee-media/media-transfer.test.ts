import { describe, expect, it } from "vitest";

import { decodePlainEnvelope, encodePlainEnvelope, type MediaEnvelope } from "../e2ee/plain-envelope";
import { err, ok } from "../result";
import { MEDIA_CHUNK_SIZE, b64ToBytes, decryptMedia, encryptMedia, encryptedSize } from "./media-crypto";
import {
  downloadDecryptedMedia,
  mediaViewState,
  openThumbnail,
  uploadEncryptedMedia,
  type FetchFn,
} from "./media-transfer";

/** In-memory R2: PUT stores bytes, GET returns them or 404. */
function fakeR2() {
  const objects = new Map<string, Uint8Array>();
  const fetchFn: FetchFn = async (url, init) => {
    if (init?.method === "PUT") {
      objects.set(url, init.body!);
      return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) };
    }
    const o = objects.get(url);
    if (!o) return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
    const copy = o.slice();
    return { ok: true, status: 200, arrayBuffer: async () => copy.buffer as ArrayBuffer };
  };
  return { objects, fetchFn };
}

const rnd = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + 7) & 255);
const secret = new TextEncoder().encode("TOP-SECRET-PLAINTEXT-MARKER ".repeat(10));
const grant = async () => ok({ url: "https://r2.test/media/c1/obj", key: "media/c1/obj" });
const link = async () => ok({ url: "https://r2.test/media/c1/obj" });

function contains(hay: Uint8Array, needle: Uint8Array) {
  outer: for (let i = 0; i + needle.length <= hay.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

describe("chunked AES-256-GCM", () => {
  it("round-trips across chunk boundaries and reports the exact size", async () => {
    for (const n of [0, 1, MEDIA_CHUNK_SIZE - 1, MEDIA_CHUNK_SIZE, MEDIA_CHUNK_SIZE + 1, 3 * MEDIA_CHUNK_SIZE + 5]) {
      const plain = rnd(n);
      const enc = await encryptMedia(plain);
      expect(enc.ciphertext.length).toBe(encryptedSize(n));
      const dec = await decryptMedia(enc.ciphertext, enc.key, enc.sha256);
      expect(dec.ok && Buffer.compare(dec.value, plain)).toBe(0);
    }
  });

  it("rejects a flipped bit, a dropped chunk, a swapped chunk and a truncated tail", async () => {
    const plain = rnd(3 * MEDIA_CHUNK_SIZE);
    const enc = await encryptMedia(plain);
    const sealed = MEDIA_CHUNK_SIZE + 16;
    const flip = enc.ciphertext.slice();
    flip[9 + sealed + 7] ^= 1;
    expect(await decryptMedia(flip, enc.key)).toEqual(err("media.corrupt"));

    const head = enc.ciphertext.subarray(0, 9);
    const c = (i: number) => enc.ciphertext.subarray(9 + i * sealed, 9 + (i + 1) * sealed);
    const join = (...p: Uint8Array[]) => Uint8Array.from(p.flatMap((x) => [...x]));
    expect((await decryptMedia(join(head, c(0), c(2)), enc.key)).ok).toBe(false);
    expect((await decryptMedia(join(head, c(1), c(0), c(2)), enc.key)).ok).toBe(false);
    expect((await decryptMedia(join(head, c(0), c(1)), enc.key)).ok).toBe(false);
  });
});

describe("encrypted media upload and download against a mocked R2", () => {
  it("stores ciphertext without the plaintext and cannot decrypt without the key", async () => {
    const r2 = fakeR2();
    const up = await uploadEncryptedMedia({
      conversationId: "c1",
      bytes: secret,
      mimeType: "text/plain",
      requestUploadUrl: grant,
      fetchFn: r2.fetchFn,
    });
    expect(up.ok).toBe(true);
    if (!up.ok) return;
    const raw = r2.objects.get("https://r2.test/media/c1/obj")!;
    expect(contains(raw, new TextEncoder().encode("TOP-SECRET"))).toBe(false);
    expect(raw.length).toBe(encryptedSize(secret.length));
    expect((await decryptMedia(raw, crypto.getRandomValues(new Uint8Array(32)))).ok).toBe(false);
    expect(JSON.stringify(up.value)).not.toContain("TOP-SECRET");

    const down = await downloadDecryptedMedia({
      conversationId: "c1",
      body: up.value,
      requestDownloadUrl: link,
      fetchFn: r2.fetchFn,
    });
    expect(down.ok && Buffer.compare(down.value, secret)).toBe(0);
  });

  it("rejects a tampered object and a wrong SHA-256", async () => {
    const r2 = fakeR2();
    const up = await uploadEncryptedMedia({
      conversationId: "c1", bytes: secret, mimeType: "text/plain", requestUploadUrl: grant, fetchFn: r2.fetchFn,
    });
    if (!up.ok) throw new Error("upload");
    const dl = (body: typeof up.value) =>
      downloadDecryptedMedia({ conversationId: "c1", body, requestDownloadUrl: link, fetchFn: r2.fetchFn });

    expect(await dl({ ...up.value, sha256: "0".repeat(64) })).toEqual(err("media.hash_mismatch"));

    const url = "https://r2.test/media/c1/obj";
    r2.objects.get(url)![20] ^= 1;
    expect(await dl(up.value)).toEqual(err("media.hash_mismatch"));
    // Attacker also fixes the hash: authentication of the chunk still fails.
    const forged = r2.objects.get(url)!;
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", forged.slice().buffer as ArrayBuffer)), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("");
    expect(await dl({ ...up.value, sha256: hash })).toEqual(err("media.corrupt"));
  });

  it("maps a 404 to media.expired and the view state to expired", async () => {
    const r2 = fakeR2();
    const res = await downloadDecryptedMedia({
      conversationId: "c1",
      body: { r2Key: "media/c1/gone", key: "AA==", sha256: "0".repeat(64) },
      requestDownloadUrl: link,
      fetchFn: r2.fetchFn,
    });
    expect(res).toEqual(err("media.expired"));
    expect(mediaViewState(res.ok ? null : res.error)).toBe("expired");
    expect(mediaViewState({ code: "media.hash_mismatch" })).toBe("failed");
    expect(mediaViewState(null)).toBe("ready");
  });

  it("surfaces server rejections and failed PUTs without sending to R2", async () => {
    const r2 = fakeR2();
    const denied = await uploadEncryptedMedia({
      conversationId: "c1", bytes: secret, mimeType: "text/plain",
      requestUploadUrl: async () => err("media.too_large"), fetchFn: r2.fetchFn,
    });
    expect(denied).toEqual(err("media.too_large"));
    expect(r2.objects.size).toBe(0);
    const failing = await uploadEncryptedMedia({
      conversationId: "c1", bytes: secret, mimeType: "text/plain", requestUploadUrl: grant,
      fetchFn: async () => ({ ok: false, status: 403, arrayBuffer: async () => new ArrayBuffer(0) }),
    });
    expect(failing).toEqual(err("media.upload_failed"));
  });

  it("carries an encrypted thumbnail inline and the media envelope round-trips", async () => {
    const r2 = fakeR2();
    const thumb = new TextEncoder().encode("THUMB-PIXELS");
    const up = await uploadEncryptedMedia({
      conversationId: "c1", bytes: secret, mimeType: "image/png", thumbnail: thumb,
      requestUploadUrl: grant, fetchFn: r2.fetchFn,
    });
    if (!up.ok) throw new Error("upload");
    expect(up.value.thumbnail).toBeTruthy();
    expect(up.value.thumbnail).not.toContain("THUMB");
    expect(new TextDecoder().decode((await openThumbnail(up.value))!)).toBe("THUMB-PIXELS");
    expect(b64ToBytes(up.value.key).length).toBe(32);

    const env: MediaEnvelope = {
      v: 1, kind: "media", id: "m1", conversationId: "c1", sentAt: new Date().toISOString(), body: up.value,
    };
    expect(decodePlainEnvelope(encodePlainEnvelope(env).trimEnd())).toMatchObject({ kind: "media", body: { r2Key: "media/c1/obj" } });
    expect(decodePlainEnvelope(JSON.stringify({ ...env, body: { ...up.value, sha256: "xyz" } }))).toBeNull();
  });
});
