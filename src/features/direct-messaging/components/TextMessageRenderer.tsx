"use client";

import { memo } from "react";

import type { TimelineMessage } from "@/platform/timeline";

type Props = {
  message: TimelineMessage;
  currentUserId: string;
};

function TextMessageRendererInner({ message }: Props) {
  if (message.deletion_scope === "everyone") {
    return null;
  }
  return <span>{message.body ?? ""}</span>;
}

export const TextMessageRenderer = memo(TextMessageRendererInner);
