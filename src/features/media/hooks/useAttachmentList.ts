"use client";

import { useEffect, useState } from "react";

import type { MessageAttachment } from "@/platform/timeline";

import { getMessageAttachmentsAction } from "../actions";

export function useAttachmentList(
  messageId: string,
  initial: MessageAttachment[] | undefined,
): MessageAttachment[] {
  const [attachments, setAttachments] = useState<MessageAttachment[]>(
    initial ?? [],
  );

  useEffect(() => {
    if (initial && initial.length > 0) {
      setAttachments(initial);
      return;
    }
    let cancelled = false;
    void getMessageAttachmentsAction({ messageId }).then((result) => {
      if (!cancelled && result.ok) {
        setAttachments(result.value ?? []);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [initial, messageId]);

  return attachments;
}
