import { err, ok, type Result } from "@pulse/core/result";
import type { UploadGrant, UploadRequest } from "@pulse/core/e2ee-media/media-transfer";
import { mediaViewState } from "@pulse/core/e2ee-media/media-transfer";

export type JsonFetch = (
  url: string,
  init: { method: string; body: string; headers: Record<string, string> },
) => Promise<{ json(): Promise<unknown> }>;

/**
 * Client for the media-upload-url Edge Function (issue #230). Only used when the e2ee flag is on;
 * the legacy Supabase-storage path in service.ts is untouched.
 */
export function createMediaGrantClient(args: {
  functionsUrl: string;
  getAccessToken(): Promise<string | null>;
  fetchFn: JsonFetch;
}) {
  async function post<T>(body: Record<string, unknown>): Promise<Result<T>> {
    const token = await args.getAccessToken();
    if (!token) return err("platform.unauthenticated");
    let res: { json(): Promise<unknown> };
    try {
      res = await args.fetchFn(`${args.functionsUrl.replace(/\/$/, "")}/media-upload-url`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      return err("platform.network");
    }
    const json = (await res.json().catch(() => null)) as
      | { ok: true; value: T }
      | { ok: false; error?: { code?: string } }
      | null;
    if (json && json.ok) return ok(json.value);
    return err((json && !json.ok && json.error?.code) || "platform.unknown");
  }

  return {
    requestUploadUrl: (req: UploadRequest) => post<UploadGrant>({ action: "upload", ...req }),
    requestDownloadUrl: (req: { conversationId: string; key: string }) =>
      post<{ url: string }>({ action: "download", ...req }),
  };
}

/** i18n key (features/media messages) for a media failure, or null when the media is fine. */
export function mediaStatusMessageKey(error: { code: string } | null): "mediaExpired" | "mediaDownloadFailed" | null {
  const state = mediaViewState(error);
  return state === "expired" ? "mediaExpired" : state === "failed" ? "mediaDownloadFailed" : null;
}
