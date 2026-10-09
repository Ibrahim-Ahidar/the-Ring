"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from "react";

import { emitComposerActivity } from "@/platform/composer-events";
import { joinConversation, joinInbox } from "@/platform/realtime-hub";
import { createSupabaseBrowserClient } from "@/platform/supabase/browser";
import type { TimelineMessage } from "@/platform/timeline";

import { getMessageAttachmentsAction } from "@/features/media/actions";

import {
  getConversationAction,
  listConversationsAction,
  listMessagesAction,
  markReadAction,
  sendTextAction,
} from "../actions";
import { needsAttachmentFetch } from "../lib/realtime-message";
import { firstUnreadMessageId } from "../delivery";
import { messagePageNextCursor } from "../service";
import type { ConversationDetail, ConversationSummary } from "../types";
import {
  inboxFiltersToListArgs,
  type InboxFilters,
} from "../lib/inbox-filters";
import { rowToTimelineMessage } from "./map-row";
import { createInitialState, messagingReducer } from "./reducer";
import {
  DRAFTS_STORAGE_KEY,
  type MessagingState,
  type PendingSend,
} from "./types";

type MessagingContextValue = {
  state: MessagingState;
  sendMessage: (input: {
    conversationId: string;
    body: string;
    replyToId?: string | null;
  }) => Promise<void>;
  retrySend: (clientId: string) => Promise<void>;
  setDraft: (conversationId: string, text: string) => void;
  loadOlderMessages: (conversationId: string) => Promise<void>;
  refreshConversation: (conversationId: string) => Promise<void>;
};

const MessagingContext = createContext<MessagingContextValue | null>(null);

const INBOX_REFRESH_DEBOUNCE_MS = 400;

function scheduleInboxRefresh(
  timerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>,
  refresh: () => void,
): void {
  if (timerRef.current) {
    clearTimeout(timerRef.current);
  }
  timerRef.current = setTimeout(() => {
    timerRef.current = null;
    refresh();
  }, INBOX_REFRESH_DEBOUNCE_MS);
}

function readDraftsFromStorage(): Record<string, string> {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(DRAFTS_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function writeDraftsToStorage(drafts: Record<string, string>): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
}

type ProviderProps = {
  userId: string;
  initialConversations: ConversationSummary[];
  initialConversationsHasMore: boolean;
  inboxFilters?: InboxFilters;
  initialConversationId?: string;
  initialMessages?: TimelineMessage[];
  initialMessagesHasMore?: boolean;
  initialDetail?: ConversationDetail;
  children: ReactNode;
};

export function MessagingProvider({
  userId,
  initialConversations,
  initialConversationsHasMore,
  inboxFilters,
  initialConversationId,
  initialMessages,
  initialMessagesHasMore,
  initialDetail,
  children,
}: ProviderProps) {
  const inboxFiltersRef = useRef(inboxFilters);
  inboxFiltersRef.current = inboxFilters;

  const listInbox = useCallback(async () => {
    const args = inboxFiltersToListArgs(
      inboxFiltersRef.current ?? { includeArchived: false, folderId: null },
    );
    return listConversationsAction(args);
  }, []);
  const [state, dispatch] = useReducer(
    messagingReducer,
    userId,
    (id) => {
      const base = createInitialState(id);
      base.conversations = initialConversations;
      base.conversationsHasMore = initialConversationsHasMore;
      if (initialConversationId && initialMessages) {
        base.messagesByConversation[initialConversationId] = initialMessages;
        base.messagesHasMore[initialConversationId] =
          initialMessagesHasMore ?? false;
        base.messageCursors[initialConversationId] = messagePageNextCursor(
          initialMessages as never,
        );
      }
      if (initialConversationId && initialDetail) {
        base.detailsByConversation[initialConversationId] = initialDetail;
      }
      return base;
    },
  );

  useEffect(() => {
    dispatch({ type: "drafts/hydrate", drafts: readDraftsFromStorage() });
  }, []);

  useEffect(() => {
    writeDraftsToStorage(state.drafts);
  }, [state.drafts]);

  const flushPending = useCallback(async () => {
    const queue = state.pendingSends.filter((p) => p.status === "pending");
    for (const pending of queue) {
      dispatch({
        type: "pending/update",
        clientId: pending.clientId,
        status: "pending",
      });
      const result = await sendTextAction({
        conversationId: pending.conversationId,
        clientId: pending.clientId,
        body: pending.body,
        replyToId: pending.replyToId,
      });
      if (!result.ok) {
        dispatch({
          type: "pending/update",
          clientId: pending.clientId,
          status: "failed",
        });
        continue;
      }
      dispatch({ type: "pending/remove", clientId: pending.clientId });
      dispatch({
        type: "messages/upsert",
        conversationId: pending.conversationId,
        message: result.value,
      });
      emitComposerActivity({
        kind: "sent",
        conversationId: pending.conversationId,
      });
    }
  }, [state.pendingSends]);

  useEffect(() => {
    if (state.connectionStatus === "connected") {
      void flushPending();
    }
  }, [flushPending, state.connectionStatus]);

  const reconcile = useCallback(async () => {
    const list = await listInbox();
    if (list.ok) {
      dispatch({
        type: "conversations/set",
        items: list.value.items,
        hasMore: list.value.hasMore,
      });
    }
    const openIds = new Set(
      initialConversationId ? [initialConversationId] : [],
    );
    for (const pending of state.pendingSends) {
      openIds.add(pending.conversationId);
    }
    for (const conversationId of openIds) {
      const page = await listMessagesAction({ conversationId });
      if (!page.ok) {
        continue;
      }
      dispatch({
        type: "messages/set",
        conversationId,
        items: page.value.items as TimelineMessage[],
        hasMore: page.value.hasMore,
        cursor: messagePageNextCursor(page.value.items),
      });
    }
    await flushPending();
  }, [flushPending, initialConversationId, listInbox, state.pendingSends]);

  const inboxRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshInboxList = useCallback(() => {
    void listInbox().then((result) => {
      if (result.ok) {
        dispatch({
          type: "conversations/set",
          items: result.value.items,
          hasMore: result.value.hasMore,
        });
      }
    });
  }, [listInbox]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const inbox = joinInbox(supabase, userId);

    const offStatus = inbox.onStatus((status) => {
      if (status === "SUBSCRIBED") {
        if (state.connectionStatus === "reconnecting") {
          void reconcile();
        }
        dispatch({ type: "connection", status: "connected" });
        return;
      }
      if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        dispatch({ type: "connection", status: "reconnecting" });
      }
    });

    const offChange = inbox.onChange((change) => {
      if (change.table === "conversations") {
        if (change.eventType === "UPDATE") {
          scheduleInboxRefresh(inboxRefreshTimerRef, refreshInboxList);
        }
        return;
      }
      if (change.table === "conversation_members") {
        if (
          change.eventType === "INSERT" ||
          change.eventType === "UPDATE" ||
          change.eventType === "DELETE"
        ) {
          scheduleInboxRefresh(inboxRefreshTimerRef, refreshInboxList);
        }
      }
    });

    return () => {
      const timer = inboxRefreshTimerRef.current;
      if (timer) {
        clearTimeout(timer);
      }
      offStatus();
      offChange();
      inbox.leave();
    };
  }, [reconcile, refreshInboxList, state.connectionStatus, userId]);

  useEffect(() => {
    if (!initialConversationId) {
      return;
    }
    const supabase = createSupabaseBrowserClient();
    const topic = joinConversation(supabase, initialConversationId, userId);

    const offStatus = topic.onStatus((status) => {
      if (status === "SUBSCRIBED") {
        dispatch({ type: "connection", status: "connected" });
      } else if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        dispatch({ type: "connection", status: "reconnecting" });
      }
    });

    const applyMessageRow = (row: Record<string, unknown>) => {
      const message = rowToTimelineMessage(row);
      if (!message) {
        return;
      }
      dispatch({
        type: "messages/upsert",
        conversationId: initialConversationId,
        message,
      });
      if (needsAttachmentFetch(message)) {
        void getMessageAttachmentsAction({ messageId: message.id }).then(
          (result) => {
            if (!result.ok || !result.value?.length) {
              return;
            }
            dispatch({
              type: "messages/upsert",
              conversationId: initialConversationId,
              message: { ...message, attachments: result.value },
            });
          },
        );
      }
    };

    const offChange = topic.onChange((change) => {
      if (change.table === "message_hides") {
        if (change.eventType !== "INSERT") {
          return;
        }
        const hideUserId = change.new.user_id;
        const messageId = change.new.message_id;
        if (hideUserId === userId && typeof messageId === "string") {
          dispatch({
            type: "messages/remove",
            conversationId: initialConversationId,
            messageId,
          });
        }
        return;
      }

      if (change.table === "conversation_members") {
        if (
          change.eventType === "INSERT" ||
          change.eventType === "UPDATE" ||
          change.eventType === "DELETE"
        ) {
          void getConversationAction({
            conversationId: initialConversationId,
          }).then((result) => {
            if (result.ok) {
              dispatch({
                type: "detail/set",
                conversationId: initialConversationId,
                detail: result.value,
              });
            }
          });
        }
        return;
      }

      if (change.table !== "messages") {
        return;
      }

      if (change.eventType === "INSERT" || change.eventType === "UPDATE") {
        applyMessageRow(change.new);
      }
    });

    return () => {
      offStatus();
      offChange();
      topic.leave();
    };
  }, [initialConversationId, userId]);

  useEffect(() => {
    if (!initialConversationId || !initialDetail || !initialMessages) {
      return;
    }
    const separator = firstUnreadMessageId(
      initialMessages,
      initialDetail.last_read_message_id,
      userId,
    );
    dispatch({
      type: "unreadSeparator/set",
      conversationId: initialConversationId,
      messageId: separator,
    });
    const latest = initialMessages[0];
    if (latest) {
      void markReadAction({
        conversationId: initialConversationId,
        messageId: latest.id,
      }).then((result) => {
        if (result.ok && initialDetail) {
          dispatch({
            type: "detail/set",
            conversationId: initialConversationId,
            detail: {
              ...initialDetail,
              last_read_message_id: result.value.last_read_message_id,
              last_read_at: result.value.last_read_at,
            },
          });
        }
      });
    }
  }, [initialConversationId, initialDetail, initialMessages, userId]);

  const sendMessage = useCallback(
    async (input: {
      conversationId: string;
      body: string;
      replyToId?: string | null;
    }) => {
      const clientId = crypto.randomUUID();
      const pending: PendingSend = {
        clientId,
        conversationId: input.conversationId,
        body: input.body,
        replyToId: input.replyToId,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: "pending/add", pending });
      dispatch({ type: "draft/set", conversationId: input.conversationId, text: "" });

      if (state.connectionStatus !== "connected") {
        return;
      }

      const result = await sendTextAction({
        conversationId: input.conversationId,
        clientId,
        body: input.body,
        replyToId: input.replyToId,
      });
      if (!result.ok) {
        dispatch({
          type: "pending/update",
          clientId,
          status: "failed",
        });
        return;
      }
      dispatch({ type: "pending/remove", clientId });
      dispatch({
        type: "messages/upsert",
        conversationId: input.conversationId,
        message: result.value,
      });
      emitComposerActivity({ kind: "sent", conversationId: input.conversationId });
    },
    [state.connectionStatus],
  );

  const retrySend = useCallback(async (clientId: string) => {
    const pending = state.pendingSends.find((p) => p.clientId === clientId);
    if (!pending) {
      return;
    }
    dispatch({
      type: "pending/update",
      clientId,
      status: "pending",
    });
    const result = await sendTextAction({
      conversationId: pending.conversationId,
      clientId: pending.clientId,
      body: pending.body,
      replyToId: pending.replyToId,
    });
    if (!result.ok) {
      dispatch({
        type: "pending/update",
        clientId,
        status: "failed",
      });
      return;
    }
    dispatch({ type: "pending/remove", clientId });
    dispatch({
      type: "messages/upsert",
      conversationId: pending.conversationId,
      message: result.value,
    });
    emitComposerActivity({
      kind: "sent",
      conversationId: pending.conversationId,
    });
  }, [state.pendingSends]);

  const setDraft = useCallback((conversationId: string, text: string) => {
    dispatch({ type: "draft/set", conversationId, text });
  }, []);

  const loadOlderMessages = useCallback(
    async (conversationId: string) => {
      const cursor = state.messageCursors[conversationId];
      if (!cursor) {
        return;
      }
      const page = await listMessagesAction({ conversationId, cursor });
      if (!page.ok) {
        return;
      }
      dispatch({
        type: "messages/mergePage",
        conversationId,
        items: page.value.items as TimelineMessage[],
        hasMore: page.value.hasMore,
        cursor: messagePageNextCursor(page.value.items),
      });
    },
    [state.messageCursors],
  );

  const refreshConversation = useCallback(async (conversationId: string) => {
    const page = await listMessagesAction({ conversationId });
    if (page.ok) {
      dispatch({
        type: "messages/set",
        conversationId,
        items: page.value.items as TimelineMessage[],
        hasMore: page.value.hasMore,
        cursor: messagePageNextCursor(page.value.items),
      });
    }
  }, []);

  const value = useMemo(
    () => ({
      state,
      sendMessage,
      retrySend,
      setDraft,
      loadOlderMessages,
      refreshConversation,
    }),
    [
      loadOlderMessages,
      refreshConversation,
      retrySend,
      sendMessage,
      setDraft,
      state,
    ],
  );

  return (
    <MessagingContext.Provider value={value}>{children}</MessagingContext.Provider>
  );
}

export function useMessaging() {
  const ctx = useContext(MessagingContext);
  if (!ctx) {
    throw new Error("useMessaging must be used within MessagingProvider");
  }
  return ctx;
}
