import type { MediaBody } from "@pulse/core/e2ee/plain-envelope";
import {
  downloadDecryptedMedia,
  uploadEncryptedMedia,
  type EncryptedUploadInput,
  type FetchFn,
} from "@pulse/core/e2ee-media/media-transfer";
import { readStoredMediaRef } from "@pulse/core/local-store";
import type { Result } from "@pulse/core/result";

import { getPublicEnv } from "@/platform/env/public";
import { getLocalStore } from "@/platform/local-store";
import { createSupabaseBrowserClient } from "@/platform/supabase/browser";

import { createMediaGrantClient } from "./encrypted-media";

/** Plain fetch of the pre-signed R2 link; only ciphertext ever goes through it. */
export const mediaFetch: FetchFn = (url, init) =>
  fetch(url, {
    method: init?.method,
    headers: init?.headers,
    body: init?.body as BodyInit | undefined,
  });

/** Grant client for the media-upload-url Edge Function, signed in with the current session. */
export function getMediaGrantClient() {
  const supabase = createSupabaseBrowserClient();
  return createMediaGrantClient({
    functionsUrl: `${getPublicEnv().supabaseUrl.replace(/\/$/, "")}/functions/v1`,
    getAccessToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
    fetchFn: (url, init) => fetch(url, init),
  });
}

/** Current signed-in user id, or null. */
export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await createSupabaseBrowserClient().auth.getSession();
  return data.session?.user.id ?? null;
}

export type EncryptedMediaDeps = {
  /** Fetches, verifies the hash of and decrypts the file of a media message. */
  download(conversationId: string, body: Pick<MediaBody, "r2Key" | "key" | "sha256">): Promise<Result<Uint8Array>>;
  /** Persists `expired: true` in the local row so the file is never fetched again. */
  markExpired(messageId: string): Promise<void>;
};

export function getEncryptedMediaDeps(): EncryptedMediaDeps {
  return {
    download: (conversationId, body) =>
      downloadDecryptedMedia({
        conversationId,
        body,
        requestDownloadUrl: (req) => getMediaGrantClient().requestDownloadUrl(req),
        fetchFn: mediaFetch,
      }),
    async markExpired(messageId) {
      const store = await getLocalStore();
      const row = await store?.getMessage(messageId);
      if (!store || !row || !readStoredMediaRef(row)) return;
      const media = JSON.parse(row.media_json as string) as Record<string, unknown>;
      await store.upsertMessages([{ ...row, media_json: JSON.stringify({ ...media, expired: true }) }]);
    },
  };
}

/** Encrypts and uploads a file through the grant client; resolves to the media message body. */
export function uploadWithGrant(
  input: Omit<EncryptedUploadInput, "requestUploadUrl" | "fetchFn">,
): Promise<Result<MediaBody>> {
  return uploadEncryptedMedia({
    ...input,
    requestUploadUrl: (req) => getMediaGrantClient().requestUploadUrl(req),
    fetchFn: mediaFetch,
  });
}
