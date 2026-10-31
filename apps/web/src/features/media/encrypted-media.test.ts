import { describe, expect, it } from "vitest";
import { createMediaGrantClient, mediaStatusMessageKey } from "./encrypted-media";

const reply = (body: unknown, status = 200) => async () => Response.json(body, { status });

describe("createMediaGrantClient", () => {
  it("posts the action and bearer token, and unwraps the grant", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const c = createMediaGrantClient({
      functionsUrl: "https://p.supabase.co/functions/v1/",
      getAccessToken: async () => "tok",
      fetchFn: async (url, init) => {
        seen = { url: String(url), init: init as RequestInit };
        return Response.json({ ok: true, value: { url: "https://r2/put", key: "media/c/k" } });
      },
    });
    const r = await c.requestUploadUrl({ conversationId: "c", mimeType: "image/png", sizeBytes: 5 });
    expect(r).toEqual({ ok: true, value: { url: "https://r2/put", key: "media/c/k" } });
    expect(seen!.url).toBe("https://p.supabase.co/functions/v1/media-upload-url");
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(String(seen!.init.body))).toMatchObject({ action: "upload", conversationId: "c" });
  });

  it("surfaces server error codes, network failures and a missing session", async () => {
    const mk = (fetchFn: never, token: string | null = "t") =>
      createMediaGrantClient({ functionsUrl: "https://x", getAccessToken: async () => token, fetchFn });
    const down = { conversationId: "c", key: "k" };
    expect(await mk(reply({ ok: false, error: { code: "media.too_large" } }, 400) as never).requestUploadUrl({ conversationId: "c", mimeType: "image/png", sizeBytes: 1 })).toEqual({ ok: false, error: { code: "media.too_large" } });
    expect((await mk((async () => { throw new Error("x"); }) as never).requestDownloadUrl(down))).toEqual({ ok: false, error: { code: "platform.network" } });
    expect((await mk(reply({}) as never, null).requestDownloadUrl(down))).toEqual({ ok: false, error: { code: "platform.unauthenticated" } });
  });
});

describe("mediaStatusMessageKey", () => {
  it("renders a 404 as media expired", () => {
    expect(mediaStatusMessageKey({ code: "media.expired" })).toBe("mediaExpired");
    expect(mediaStatusMessageKey({ code: "media.download_failed" })).toBe("mediaDownloadFailed");
    expect(mediaStatusMessageKey(null)).toBeNull();
  });
});
