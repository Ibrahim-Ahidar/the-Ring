"use client";

import { memo } from "react";

import type { TimelineMessage } from "@/platform/timeline";

import { MessagingProvider } from "../context/MessagingProvider";
import type { ConversationDetail, ConversationSummary } from "../types";
import { ChatsLayout } from "./ChatsLayout";

type Props = {
  userId: string;
  initialConversations: ConversationSummary[];
  initialConversationsHasMore: boolean;
  activeConversationId?: string;
  initialDetail?: ConversationDetail;
  initialMessages?: TimelineMessage[];
  initialMessagesHasMore?: boolean;
};

function ChatsAppInner(props: Props) {
  return (
    <MessagingProvider
      userId={props.userId}
      initialConversations={props.initialConversations}
      initialConversationsHasMore={props.initialConversationsHasMore}
      initialConversationId={props.activeConversationId}
      initialDetail={props.initialDetail}
      initialMessages={props.initialMessages}
      initialMessagesHasMore={props.initialMessagesHasMore}
    >
      <ChatsLayout
        userId={props.userId}
        activeConversationId={props.activeConversationId}
        threadDetail={props.initialDetail}
      />
    </MessagingProvider>
  );
}

export const ChatsApp = memo(ChatsAppInner);
