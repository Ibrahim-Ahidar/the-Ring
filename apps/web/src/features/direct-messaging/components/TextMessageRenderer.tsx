"use client";

import { memo } from "react";

import type { TimelineMessage } from "@/platform/timeline";
import ui from "@/shell/styles/ui.module.css";

type Props = {
  message: TimelineMessage;
  currentUserId: string;
};

function TextMessageRendererInner({ message }: Props) {
  if (message.deletion_scope === "everyone") {
    return null;
  }
  return <span className={ui.bubbleText}>{message.body ?? ""}</span>;
}

export const TextMessageRenderer = memo(TextMessageRendererInner);
