"use client";

import { useEffect, useState } from "react";

import { getDownloadUrlAction } from "../actions";

/** Signed URL for an attachment, fetched once per id; null until it resolves. */
export function useDownloadUrl(attachmentId: string | null | undefined): string | null {
  const [resolved, setResolved] = useState<{ id: string; url: string } | null>(null);

  useEffect(() => {
    if (!attachmentId) {
      return undefined;
    }
    let cancelled = false;
    void getDownloadUrlAction({ attachmentId }).then((result) => {
      if (!cancelled && result.ok) {
        setResolved({ id: attachmentId, url: result.value.url });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [attachmentId]);

  return resolved && resolved.id === attachmentId ? resolved.url : null;
}
