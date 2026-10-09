import type { TimelineMessage } from "@/platform/timeline";

import {
  mergeRealtimeMessage,
  shouldApplyRealtimeMessage,
} from "../lib/realtime-message";
import type { MessagingAction, MessagingState } from "./types";

function mergeMessages(
  existing: TimelineMessage[],
  incoming: TimelineMessage[],
): TimelineMessage[] {
  const map = new Map<string, TimelineMessage>();
  for (const message of existing) {
    map.set(message.id, message);
  }
  for (const message of incoming) {
    map.set(message.id, message);
  }
  return [...map.values()].sort((a, b) => {
    if (a.created_at !== b.created_at) {
      return a.created_at < b.created_at ? 1 : -1;
    }
    return a.id < b.id ? 1 : -1;
  });
}

export function createInitialState(userId: string): MessagingState {
  return {
    userId,
    conversations: [],
    conversationsHasMore: false,
    messagesByConversation: {},
    messagesHasMore: {},
    messageCursors: {},
    pendingSends: [],
    drafts: {},
    connectionStatus: "connected",
    detailsByConversation: {},
    unreadSeparatorByConversation: {},
  };
}

export function messagingReducer(
  state: MessagingState,
  action: MessagingAction,
): MessagingState {
  switch (action.type) {
    case "conversations/set":
      return {
        ...state,
        conversations: action.items,
        conversationsHasMore: action.hasMore,
      };
    case "conversations/patch": {
      const idx = state.conversations.findIndex((c) => c.id === action.item.id);
      const conversations =
        idx === -1
          ? [action.item, ...state.conversations]
          : state.conversations.map((c, i) => (i === idx ? action.item : c));
      return { ...state, conversations };
    }
    case "messages/set":
      return {
        ...state,
        messagesByConversation: {
          ...state.messagesByConversation,
          [action.conversationId]: action.items,
        },
        messagesHasMore: {
          ...state.messagesHasMore,
          [action.conversationId]: action.hasMore,
        },
        messageCursors: {
          ...state.messageCursors,
          [action.conversationId]: action.cursor,
        },
      };
    case "messages/mergePage":
      return {
        ...state,
        messagesByConversation: {
          ...state.messagesByConversation,
          [action.conversationId]: mergeMessages(
            state.messagesByConversation[action.conversationId] ?? [],
            action.items,
          ),
        },
        messagesHasMore: {
          ...state.messagesHasMore,
          [action.conversationId]: action.hasMore,
        },
        messageCursors: {
          ...state.messageCursors,
          [action.conversationId]: action.cursor,
        },
      };
    case "messages/upsert": {
      const current = state.messagesByConversation[action.conversationId] ?? [];
      if (!shouldApplyRealtimeMessage(action.message, state.userId)) {
        return {
          ...state,
          messagesByConversation: {
            ...state.messagesByConversation,
            [action.conversationId]: current.filter(
              (m) => m.id !== action.message.id,
            ),
          },
        };
      }
      const existing = current.find((m) => m.id === action.message.id);
      const merged = mergeRealtimeMessage(existing, action.message);
      const without = current.filter((m) => m.id !== merged.id);
      return {
        ...state,
        messagesByConversation: {
          ...state.messagesByConversation,
          [action.conversationId]: mergeMessages(without, [merged]),
        },
      };
    }
    case "messages/remove": {
      const current = state.messagesByConversation[action.conversationId] ?? [];
      return {
        ...state,
        messagesByConversation: {
          ...state.messagesByConversation,
          [action.conversationId]: current.filter(
            (m) => m.id !== action.messageId,
          ),
        },
      };
    }
    case "detail/set":
      return {
        ...state,
        detailsByConversation: {
          ...state.detailsByConversation,
          [action.conversationId]: action.detail,
        },
      };
    case "pending/add":
      return {
        ...state,
        pendingSends: [...state.pendingSends, action.pending],
      };
    case "pending/update":
      return {
        ...state,
        pendingSends: state.pendingSends.map((p) =>
          p.clientId === action.clientId ? { ...p, status: action.status } : p,
        ),
      };
    case "pending/remove":
      return {
        ...state,
        pendingSends: state.pendingSends.filter(
          (p) => p.clientId !== action.clientId,
        ),
      };
    case "draft/set":
      return {
        ...state,
        drafts: { ...state.drafts, [action.conversationId]: action.text },
      };
    case "drafts/hydrate":
      return { ...state, drafts: action.drafts };
    case "connection":
      return { ...state, connectionStatus: action.status };
    case "unreadSeparator/set":
      return {
        ...state,
        unreadSeparatorByConversation: {
          ...state.unreadSeparatorByConversation,
          [action.conversationId]: action.messageId,
        },
      };
    default:
      return state;
  }
}
