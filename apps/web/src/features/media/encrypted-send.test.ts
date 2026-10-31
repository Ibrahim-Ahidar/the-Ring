import { describe, expect, it, vi } from "vitest";

import { uploadEncryptedMedia, type FetchFn } from "@pulse/core/e2ee-media/media-transfer";
import { err, ok } from "@pulse/core/result";

import { sendEncryptedMedia, type EncryptedSendDeps } from "./encrypted-send";

const PLAIN = new Uint8Array([137, 80, 78, 71, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9]);

function makeDeps(over: Partial<EncryptedSendDeps> = {}) {
  const puts: Uint8Array[] = [];
  const fetchFn: FetchFn = async (_url, init) => {
    puts.push(init!.body as Uint8Array);
    return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0) };
  };
  const enqueueText = vi.fn(async () => true);
  const deps: EncryptedSendDeps = {
    getUserId: async () => "u1",
    upload: (input) =>
      uploadEncryptedMedia({
        ...input,
        requestUploadUrl: async () => ok({ url: "https://r2.test/obj-1", key: "obj-1" }),
        fetchFn,
      }),
    getOutbox: async () => ({ enqueueText }) as never,
    readDimensions: async () => ({ width: 10, height: 20 }),
    now: () => "2026-10-31T10:00:00.000Z",
    ...over,
  };
  return { deps, puts, enqueueText };
}

describe("sendEncryptedMedia", () => {
  it("uploads only ciphertext and enqueues a media envelope payload", async () => {
    const { deps, puts, enqueueText } = makeDeps();
    const file = new File([PLAIN], "pic.png", { type: "image/png" });
    const res = await sendEncryptedMedia({ conversationId: "c1", clientId: "m1", file }, deps);
    expect(res.ok).toBe(true);

    expect(puts).toHaveLength(1);
    expect(Buffer.from(puts[0]!).includes(Buffer.from(PLAIN))).toBe(false);

    expect(enqueueText).toHaveBeenCalledTimes(1);
    const [payload] = enqueueText.mock.calls[0] as unknown as [
      { media: Record<string, unknown>; clientId: string; body: string },
    ];
    expect(payload.clientId).toBe("m1");
    expect(payload.body).toBe("");
    expect(payload.media).toMatchObject({
      r2Key: "obj-1",
      mimeType: "image/png",
      fileName: "pic.png",
      width: 10,
      height: 20,
    });
    expect(typeof payload.media.key).toBe("string");
    expect(typeof payload.media.sha256).toBe("string");
  });

  it("does not enqueue when the upload fails", async () => {
    const { deps, enqueueText } = makeDeps({ upload: async () => err("media.upload_failed") });
    const file = new File([PLAIN], "pic.png", { type: "image/png" });
    const res = await sendEncryptedMedia({ conversationId: "c1", clientId: "m1", file }, deps);
    expect(res.ok).toBe(false);
    expect(enqueueText).not.toHaveBeenCalled();
  });
});
