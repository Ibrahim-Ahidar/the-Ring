import type { TimelineMessage } from "@/platform/timeline";

import type { ConversationDetail, ConversationSummary } from "../types";

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

export type PendingSend = {
  clientId: string;
  conversationId: string;
  body: string;
  replyToId?: string | null;
  status: "pending" | "failed";
  createdAt: string;
};

export type MessagingState = {
  userId: string;
  conversations: ConversationSummary[];
  conversationsHasMore: boolean;
  messagesByConversation: Record<string, TimelineMessage[]>;
  messagesHasMore: Record<string, boolean>;
  messageCursors: Record<string, string | null>;
  pendingSends: PendingSend[];
  drafts: Record<string, string>;
  connectionStatus: ConnectionStatus;
  detailsByConversation: Record<string, ConversationDetail>;
  unreadSeparatorByConversation: Record<string, string | null>;
};

export type MessagingAction =
  | {
      type: "conversations/set";
      items: ConversationSummary[];
      hasMore: boolean;
    }
  | { type: "conversations/patch"; item: ConversationSummary }
  | {
      type: "messages/set";
      conversationId: string;
      items: TimelineMessage[];
      hasMore: boolean;
      cursor: string | null;
    }
  | {
      type: "messages/mergePage";
      conversationId: string;
      items: TimelineMessage[];
      hasMore: boolean;
      cursor: string | null;
    }
  | { type: "messages/upsert"; conversationId: string; message: TimelineMessage }
  | { type: "detail/set"; conversationId: string; detail: ConversationDetail }
  | { type: "pending/add"; pending: PendingSend }
  | {
      type: "pending/update";
      clientId: string;
      status: "pending" | "failed";
    }
  | { type: "pending/remove"; clientId: string }
  | { type: "draft/set"; conversationId: string; text: string }
  | { type: "connection"; status: ConnectionStatus }
  | {
      type: "unreadSeparator/set";
      conversationId: string;
      messageId: string | null;
    }
  | { type: "drafts/hydrate"; drafts: Record<string, string> };

export const DRAFTS_STORAGE_KEY = "pulse.messaging.drafts.v1";
