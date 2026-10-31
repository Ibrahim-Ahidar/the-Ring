import { describe, expect, it } from "vitest";
import { handle, type Deps } from "../../../../supabase/functions/media-upload-url/handler.ts";
import { presignUrl } from "../../../../supabase/functions/media-upload-url/presign.ts";
import { encryptedSize } from "../../../../supabase/functions/media-upload-url/policy.ts";
import { encryptMedia } from "../../../../packages/core/src/e2ee-media/media-crypto";

const CONV = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const cfg = { accountId: "acct", accessKeyId: "AKID", secretAccessKey: "SECRET", bucket: "pulse-media" };
const NOW = new Date("2026-10-31T12:00:00.000Z");

function deps(over: Partial<Deps> = {}): Deps {
  return {
    r2: cfg,
    now: () => NOW,
    newId: () => "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    authenticate: async () => ({ userId: "u1" }),
    isMember: async (_a, c) => c === CONV,
    ...over,
  };
}

const call = (body: unknown, d: Deps = deps(), headers: Record<string, string> = { Authorization: "Bearer t" }) =>
  handle(new Request("https://x/media-upload-url", { method: "POST", headers, body: JSON.stringify(body) }), d);

describe("browser CORS", () => {
  it("answers the preflight without auth and allows the headers the client sends", async () => {
    const res = await handle(new Request("https://x/media-upload-url", { method: "OPTIONS" }), deps());
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
    const allowed = res.headers.get("Access-Control-Allow-Headers")?.toLowerCase();
    expect(allowed).toContain("authorization");
    expect(allowed).toContain("content-type");
  });

  it("puts the CORS header on success and on errors, so the browser can read the error code", async () => {
    const ok = await call({ action: "upload", conversationId: CONV, mimeType: "image/png", sizeBytes: encryptedSize(10) });
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const denied = await call({ conversationId: CONV }, deps(), {});
    expect(denied.status).toBe(401);
    expect(denied.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});

describe("presignUrl (SigV4)", () => {
  it("matches the published AWS example vector", async () => {
    const url = await presignUrl(
      { accountId: "", accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", bucket: "examplebucket" },
      {
        method: "GET",
        key: "test.txt",
        expiresSec: 86400,
        now: new Date("2013-05-24T00:00:00Z"),
        host: "examplebucket.s3.amazonaws.com",
        region: "us-east-1",
        pathStyle: false,
      },
    );
    expect(url).toContain("X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404");
  });
});

describe("media-upload-url handler", () => {
  it("signs a 5-minute PUT with the exact content-length for a member", async () => {
    const size = encryptedSize(1000);
    const res = await call({ conversationId: CONV, mimeType: "image/png", sizeBytes: size });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.value.key).toBe(`media/${CONV}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`);
    const u = new URL(body.value.url);
    expect(u.hostname).toBe("acct.r2.cloudflarestorage.com");
    expect(u.pathname).toBe(`/pulse-media/media/${CONV}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`);
    expect(u.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(u.searchParams.get("X-Amz-SignedHeaders")).toBe("content-length;host");
    expect(u.searchParams.get("X-Amz-Signature")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("signature depends on the declared size (R2 would refuse another body size)", async () => {
    const a = await (await call({ conversationId: CONV, mimeType: "image/png", sizeBytes: encryptedSize(1000) })).json();
    const b = await (await call({ conversationId: CONV, mimeType: "image/png", sizeBytes: encryptedSize(1001) })).json();
    expect(new URL(a.value.url).searchParams.get("X-Amz-Signature")).not.toBe(
      new URL(b.value.url).searchParams.get("X-Amz-Signature"),
    );
  });

  it("accepts the real ciphertext size at the plaintext limit and rejects one chunk more", async () => {
    const limit = 8 * 1024 * 1024;
    const ok = await call({ conversationId: CONV, mimeType: "image/png", sizeBytes: encryptedSize(limit) });
    expect((await ok.json()).ok).toBe(true);
    const big = await call({ conversationId: CONV, mimeType: "image/png", sizeBytes: encryptedSize(limit) + 1 });
    expect(big.status).toBe(400);
    expect((await big.json()).error.code).toBe("media.too_large");
  });

  it("the size policy matches what encryptMedia really produces", async () => {
    const { ciphertext } = await encryptMedia(new Uint8Array(70_000));
    expect(ciphertext.byteLength).toBe(encryptedSize(70_000));
  });

  it("rejects oversize files, unsupported types and long voice notes", async () => {
    const f = await call({ conversationId: CONV, mimeType: "application/pdf", sizeBytes: encryptedSize(20 * 1024 * 1024 + 1) });
    expect((await f.json()).error.code).toBe("media.too_large");
    const t = await call({ conversationId: CONV, mimeType: "application/x-msdownload", sizeBytes: 100 });
    expect((await t.json()).error.code).toBe("media.unsupported_type");
    const a = await call({ conversationId: CONV, mimeType: "audio/webm", sizeBytes: 1000, durationMs: 181_000 });
    expect((await a.json()).error.code).toBe("media.too_long");
  });

  it("rejects non-members for upload and download", async () => {
    const up = await call({ conversationId: OTHER, mimeType: "image/png", sizeBytes: 1000 });
    expect(up.status).toBe(403);
    const down = await call({ action: "download", conversationId: OTHER, key: `media/${OTHER}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa` });
    expect(down.status).toBe(403);
  });

  it("rejects missing or invalid auth", async () => {
    const none = await call({ conversationId: CONV, mimeType: "image/png", sizeBytes: 1000 }, deps(), {});
    expect(none.status).toBe(401);
    const bad = await call({ conversationId: CONV, mimeType: "image/png", sizeBytes: 1000 }, deps({ authenticate: async () => null }));
    expect(bad.status).toBe(401);
  });

  it("signs a download only for keys under the conversation's own prefix", async () => {
    const ok = await call({ action: "download", conversationId: CONV, key: `media/${CONV}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa` });
    const body = await ok.json();
    expect(body.ok).toBe(true);
    expect(new URL(body.value.url).searchParams.get("X-Amz-Expires")).toBe("300");
    const cross = await call({ action: "download", conversationId: CONV, key: `media/${OTHER}/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa` });
    expect(cross.status).toBe(400);
    const trav = await call({ action: "download", conversationId: CONV, key: `media/${CONV}/../x` });
    expect(trav.status).toBe(400);
  });

  it("reports a missing R2 configuration instead of crashing", async () => {
    const res = await call({ conversationId: CONV, mimeType: "image/png", sizeBytes: 1000 }, deps({ r2: null }));
    expect(res.status).toBe(503);
  });
});
