"use client";

import { memo } from "react";

import type { TimelineMessage } from "@/platform/timeline";

import { MessagingProvider } from "../context/MessagingProvider";
import type { InboxFilters } from "../lib/inbox-filters";
import type { ChatsViewer, ConversationDetail, ConversationSummary } from "../types";
import { ChatsLayout } from "./ChatsLayout";

type Props = {
  userId: string;
  viewer?: ChatsViewer | null;
  initialConversations: ConversationSummary[];
  initialConversationsHasMore: boolean;
  inboxFilters?: InboxFilters;
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
      inboxFilters={props.inboxFilters}
      initialConversationId={props.activeConversationId}
      initialDetail={props.initialDetail}
      initialMessages={props.initialMessages}
      initialMessagesHasMore={props.initialMessagesHasMore}
    >
      <ChatsLayout
        userId={props.userId}
        viewer={props.viewer ?? null}
        activeConversationId={props.activeConversationId}
        threadDetail={props.initialDetail}
      />
    </MessagingProvider>
  );
}

export const ChatsApp = memo(ChatsAppInner);
