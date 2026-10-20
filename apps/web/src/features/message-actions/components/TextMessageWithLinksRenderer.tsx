"use client";

import { memo } from "react";

import type { TimelineMessage } from "@pulse/core/timeline";

import { LinkedText } from "./LinkedText";

type Props = {
  message: TimelineMessage;
  currentUserId: string;
};

function TextMessageWithLinksRendererInner({ message }: Props) {
  if (message.deletion_scope === "everyone") {
    return null;
  }
  return <LinkedText text={message.body ?? ""} />;
}

export const TextMessageWithLinksRenderer = memo(TextMessageWithLinksRendererInner);
