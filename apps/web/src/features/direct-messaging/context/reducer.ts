import type { TimelineMessage } from "@pulse/core/timeline";

import { mergeDetailMonotonic, rankDelivery } from "../delivery";
import {
  mergeRealtimeMessage,
  shouldApplyRealtimeMessage,
} from "../lib/realtime-message";
import type { ConversationReceipt } from "../types";
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
    inboxStatus: "loading",
    archivedSummary: { count: 0, unread: 0 },
    threadFailed: {},
    messagesByConversation: {},
    messagesHasMore: {},
    messageCursors: {},
    pendingSends: [],
    connectionStatus: "connected",
    detailsByConversation: {},
    unreadSeparatorByConversation: {},
    receiptsByConversation: {},
    liveClientIds: {},
  };
}

/** Drops live flags of messages that a history load just supplied. */
function withoutLive(
  live: Record<string, true>,
  items: TimelineMessage[],
): Record<string, true> {
  if (!items.some((m) => m.client_id && live[m.client_id])) {
    return live;
  }
  const next = { ...live };
  for (const m of items) {
    if (m.client_id) {
      delete next[m.client_id];
    }
  }
  return next;
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
        inboxStatus: "ready",
      };
    case "archived/set":
      return state.archivedSummary.count === action.summary.count &&
        state.archivedSummary.unread === action.summary.unread
        ? state
        : { ...state, archivedSummary: action.summary };
    case "inbox/failed":
      // A failed refresh must not hide a list that already loaded.
      return state.conversations.length > 0
        ? state
        : { ...state, inboxStatus: "failed" };
    case "inbox/loading":
      return { ...state, inboxStatus: "loading" };
    case "thread/failed":
      return {
        ...state,
        threadFailed: { ...state.threadFailed, [action.conversationId]: true },
      };
    case "messages/evict": {
      const id = action.conversationId;
      const { [id]: _m, ...messagesByConversation } = state.messagesByConversation;
      const { [id]: _h, ...messagesHasMore } = state.messagesHasMore;
      const { [id]: _c, ...messageCursors } = state.messageCursors;
      void _m;
      void _h;
      void _c;
      return { ...state, messagesByConversation, messagesHasMore, messageCursors };
    }
    case "receipts/set": {
      const next: Record<string, ConversationReceipt> = {};
      let changed =
        Object.keys(action.receipts).length !==
        Object.keys(state.receiptsByConversation).length;
      for (const [id, incoming] of Object.entries(action.receipts)) {
        const prev = state.receiptsByConversation[id];
        const keep =
          prev &&
          prev.messageId === incoming.messageId &&
          rankDelivery(prev.status) > rankDelivery(incoming.status);
        const value = keep ? prev : incoming;
        next[id] = value;
        if (
          !prev ||
          prev.status !== value.status ||
          prev.messageId !== value.messageId
        ) {
          changed = true;
        }
      }
      return changed ? { ...state, receiptsByConversation: next } : state;
    }
    case "conversations/patch": {
      const idx = state.conversations.findIndex((c) => c.id === action.item.id);
      // Archived chats never join a list that is not the archived view, and the
      // archived view admits nothing else.
      if (idx === -1 && (action.item.archived_at !== null) !== (action.archivedOnly ?? false)) {
        return state;
      }
      const conversations =
        idx === -1
          ? [action.item, ...state.conversations]
          : state.conversations.map((c, i) => (i === idx ? action.item : c));
      return { ...state, conversations };
    }
    case "messages/set":
      return {
        ...state,
        liveClientIds: withoutLive(state.liveClientIds, action.items),
        threadFailed: state.threadFailed[action.conversationId]
          ? { ...state.threadFailed, [action.conversationId]: false }
          : state.threadFailed,
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
      // The realtime echo can land before sendText resolves; the persisted row
      // supersedes the optimistic pending item that shares its client_id.
      const echoedClientId =
        merged.sender_id === state.userId && merged.client_id
          ? merged.client_id
          : null;
      const pendingSends =
        echoedClientId &&
        state.pendingSends.some((p) => p.clientId === echoedClientId)
          ? state.pendingSends.filter((p) => p.clientId !== echoedClientId)
          : state.pendingSends;
      // Live flag: only a message new to the store (realtime insert) in a
      // thread that is loaded counts; history loads go through messages/set
      // and messages/mergePage. Own sends are flagged by pending/add, so their
      // realtime echo must not replay the animation.
      const liveClientIds =
        !existing &&
        action.conversationId in state.messagesByConversation &&
        merged.sender_id !== state.userId &&
        merged.client_id &&
        !state.liveClientIds[merged.client_id]
          ? { ...state.liveClientIds, [merged.client_id]: true as const }
          : state.liveClientIds;
      return {
        ...state,
        pendingSends,
        liveClientIds,
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
          [action.conversationId]: mergeDetailMonotonic(
            state.detailsByConversation[action.conversationId],
            action.detail,
          ),
        },
      };
    case "detail/patchOwnRead": {
      const current = state.detailsByConversation[action.conversationId];
      const item = state.conversations.find((c) => c.id === action.conversationId);
      const covers =
        !!item &&
        item.unread_count > 0 &&
        (item.last_message_id === null ||
          item.last_message_id === action.lastReadMessageId);
      const conversations = covers
        ? state.conversations.map((c) =>
            c.id === action.conversationId ? { ...c, unread_count: 0 } : c,
          )
        : state.conversations;
      const archivedSummary =
        covers && item.archived_at !== null && state.archivedSummary.unread > 0
          ? {
              ...state.archivedSummary,
              unread: Math.max(0, state.archivedSummary.unread - item.unread_count),
            }
          : state.archivedSummary;
      if (
        !current ||
        (current.last_read_message_id === action.lastReadMessageId &&
          current.last_read_at === action.lastReadAt)
      ) {
        return conversations === state.conversations
          ? state
          : { ...state, conversations, archivedSummary };
      }
      return {
        ...state,
        conversations,
        archivedSummary,
        detailsByConversation: {
          ...state.detailsByConversation,
          [action.conversationId]: {
            ...current,
            last_read_message_id: action.lastReadMessageId,
            last_read_at: action.lastReadAt,
          },
        },
      };
    }
    case "pending/add":
      return {
        ...state,
        pendingSends: [...state.pendingSends, action.pending],
        liveClientIds: { ...state.liveClientIds, [action.pending.clientId]: true },
      };
    case "live/clear": {
      if (!state.liveClientIds[action.clientId]) {
        return state;
      }
      const { [action.clientId]: _gone, ...liveClientIds } = state.liveClientIds;
      void _gone;
      return { ...state, liveClientIds };
    }
    case "pending/update":
      if (
        !state.pendingSends.some(
          (p) => p.clientId === action.clientId && p.status !== action.status,
        )
      ) {
        return state;
      }
      return {
        ...state,
        pendingSends: state.pendingSends.map((p) =>
          p.clientId === action.clientId ? { ...p, status: action.status } : p,
        ),
      };
    case "pending/remove":
      if (!state.pendingSends.some((p) => p.clientId === action.clientId)) {
        return state;
      }
      return {
        ...state,
        pendingSends: state.pendingSends.filter(
          (p) => p.clientId !== action.clientId,
        ),
      };
    case "connection":
      return state.connectionStatus === action.status
        ? state
        : { ...state, connectionStatus: action.status };
    case "unreadSeparator/set":
      if (
        (state.unreadSeparatorByConversation[action.conversationId] ?? null) ===
        action.messageId
      ) {
        return state;
      }
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
