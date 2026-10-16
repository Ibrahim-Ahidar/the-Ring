import type { TimelineMessage } from "@/platform/timeline";

import type {
  ConversationDetail,
  ConversationReceipt,
  ConversationSummary,
} from "../types";

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected" | "offline";

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
  /** Whether the first page of the chat list has arrived (or failed to). */
  inboxStatus: "loading" | "ready" | "failed";
  /** Conversations whose first message page could not be read. */
  threadFailed: Record<string, boolean>;
  messagesByConversation: Record<string, TimelineMessage[]>;
  messagesHasMore: Record<string, boolean>;
  messageCursors: Record<string, string | null>;
  pendingSends: PendingSend[];
  connectionStatus: ConnectionStatus;
  detailsByConversation: Record<string, ConversationDetail>;
  unreadSeparatorByConversation: Record<string, string | null>;
  /** Delivery status of the viewer's newest message per direct chat. */
  receiptsByConversation: Record<string, ConversationReceipt>;
};

export type MessagingAction =
  | {
      type: "conversations/set";
      items: ConversationSummary[];
      hasMore: boolean;
    }
  | { type: "inbox/failed" }
  | { type: "inbox/loading" }
  | { type: "thread/failed"; conversationId: string }
  | { type: "messages/evict"; conversationId: string }
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
  | {
      type: "messages/remove";
      conversationId: string;
      messageId: string;
    }
  | { type: "detail/set"; conversationId: string; detail: ConversationDetail }
  | {
      type: "detail/patchOwnRead";
      conversationId: string;
      lastReadMessageId: string | null;
      lastReadAt: string | null;
    }
  | { type: "pending/add"; pending: PendingSend }
  | {
      type: "pending/update";
      clientId: string;
      status: "pending" | "failed";
    }
  | { type: "pending/remove"; clientId: string }
  | { type: "connection"; status: ConnectionStatus }
  | {
      type: "unreadSeparator/set";
      conversationId: string;
      messageId: string | null;
    }
  | { type: "receipts/set"; receipts: Record<string, ConversationReceipt> };

export const DRAFTS_STORAGE_KEY = "pulse.messaging.drafts.v1";
