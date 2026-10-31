"use client";

import { useEffect, useState } from "react";

import { openThumbnail } from "@pulse/core/e2ee-media/media-transfer";
import type { StoredMediaRef } from "@pulse/core/local-store";
import type { TimelineMessage } from "@pulse/core/timeline";

import { getEncryptedMediaDeps } from "../encrypted-media-runtime";

export type EncryptedMediaState =
  | { status: "loading"; thumbUrl: string | null }
  | { status: "ready"; url: string }
  | { status: "expired" }
  | { status: "failed"; retry: () => void };

/** Messages whose file R2 already deleted (this session): never fetched twice. */
const expiredIds = new Set<string>();

/** The encrypted media reference a timeline message carries (flag on), or null. */
export function getEncryptedMediaRef(message: Pick<TimelineMessage, "metadata">): StoredMediaRef | null {
  const ref = message.metadata?.e2eeMedia as StoredMediaRef | undefined;
  return ref && typeof ref.r2Key === "string" ? ref : null;
}

/**
 * Fetches, verifies and decrypts the file on view. media.expired is persisted (expired: true in
 * the local row) and shown as "media expired"; hash mismatch, corrupt or any other failure shows
 * an error and never the bytes. Object URLs are revoked when the view goes away.
 */
export function useEncryptedMedia(message: TimelineMessage): EncryptedMediaState {
  const ref = getEncryptedMediaRef(message);
  const [result, setResult] = useState<{ id: string; state: EncryptedMediaState } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const known = Boolean(ref?.expired) || expiredIds.has(message.id);

  useEffect(() => {
    if (!ref || known) return undefined;
    let cancelled = false;
    const urls: string[] = [];
    const deps = getEncryptedMediaDeps();
    void (async () => {
      const thumb = await openThumbnail(ref).catch(() => null);
      if (cancelled) return;
      if (thumb) {
        const thumbUrl = URL.createObjectURL(new Blob([thumb as BlobPart], { type: "image/jpeg" }));
        urls.push(thumbUrl);
        setResult({ id: message.id, state: { status: "loading", thumbUrl } });
      }
      const res = await deps.download(message.conversation_id, ref);
      if (cancelled) return;
      if (res.ok) {
        const url = URL.createObjectURL(new Blob([res.value as BlobPart], { type: ref.mimeType }));
        urls.push(url);
        setResult({ id: message.id, state: { status: "ready", url } });
        return;
      }
      if (res.error.code === "media.expired") {
        expiredIds.add(message.id);
        await deps.markExpired(message.id).catch(() => undefined);
        setResult({ id: message.id, state: { status: "expired" } });
        return;
      }
      setResult({
        id: message.id,
        state: { status: "failed", retry: () => setAttempt((n) => n + 1) },
      });
    })();
    return () => {
      cancelled = true;
      for (const u of urls) URL.revokeObjectURL(u);
    };
    // The reference is immutable per message; only the id (or a tap on the failed state) refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message.id, known, attempt]);

  if (known) return { status: "expired" };
  if (result && result.id === message.id) return result.state;
  return { status: "loading", thumbUrl: null };
}

/** Test hook: forget which messages expired in this session. */
export function resetExpiredMediaCache(): void {
  expiredIds.clear();
}
