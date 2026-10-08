"use client";

import { memo } from "react";

import { TypingPresenceProvider } from "@/features/typing-presence/context/typing-presence-context";
import { HeaderStatusView } from "@/features/typing-presence/components/HeaderStatusView";

type Props = {
  conversationId: string;
  conversationType: "direct" | "group";
  otherUserId?: string;
};

export const ConversationHeaderStatus = memo(function ConversationHeaderStatus(
  props: Props,
) {
  return (
    <TypingPresenceProvider
      conversationId={props.conversationId}
      otherUserId={props.otherUserId}
    >
      <HeaderStatusView
        conversationType={props.conversationType}
        otherUserId={props.otherUserId}
      />
    </TypingPresenceProvider>
  );
});
