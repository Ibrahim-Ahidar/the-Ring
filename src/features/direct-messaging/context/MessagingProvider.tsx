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
  getConversationReceiptsAction,
  listConversationsAction,
  listMessagesAction,
  markDeliveredAction,
  markReadAction,
  sendTextAction,
} from "../actions";
import { needsAttachmentFetch } from "../lib/realtime-message";
import { firstUnreadMessageId } from "../delivery";
import { mapMessageRow, messagePageNextCursor } from "../service";
import type {
  ConversationDetail,
  ConversationReceipt,
  ConversationReceiptStatus,
  ConversationSummary,
} from "../types";
import {
  inboxFiltersToListArgs,
  type InboxFilters,
} from "../lib/inbox-filters";
import { rowToTimelineMessage } from "./map-row";
import { createInitialState, messagingReducer } from "./reducer";
import {
  DRAFTS_STORAGE_KEY,
  type ConnectionStatus,
  type MessagingState,
  type PendingSend,
} from "./types";

type LegacyMessagingState = Omit<MessagingState, "receiptsByConversation"> & {
  /** Status only; `useInbox().receipts` carries the message id as well. */
  receiptsByConversation: Record<string, ConversationReceiptStatus>;
};

export type MessagingActions = {
  sendMessage: (input: {
    conversationId: string;
    body: string;
    replyToId?: string | null;
  }) => Promise<void>;
  retrySend: (clientId: string) => Promise<void>;
  discardSend: (clientId: string) => void;
  setDraft: (conversationId: string, text: string) => void;
  loadOlderMessages: (conversationId: string) => Promise<void>;
  refreshConversation: (conversationId: string) => Promise<void>;
};

type MessagingContextValue = Omit<MessagingActions, "discardSend"> & {
  state: LegacyMessagingState;
};

type MessagesSlice = Pick<
  MessagingState,
  | "messagesByConversation"
  | "pendingSends"
  | "detailsByConversation"
  | "unreadSeparatorByConversation"
  | "messagesHasMore"
>;

export type ConversationView = {
  messages: TimelineMessage[];
  pending: PendingSend[];
  detail: ConversationDetail | undefined;
  hasMore: boolean;
  separatorId: string | null;
};

export type InboxSlice = {
  conversations: ConversationSummary[];
  hasMore: boolean;
  receipts: Record<string, ConversationReceipt>;
};

export type MarkSeenUpTo = (
  conversationId: string,
  message: TimelineMessage,
) => Promise<boolean>;

const MessagingContext = createContext<MessagingContextValue | null>(null);
const ActionsContext = createContext<MessagingActions | null>(null);
const MarkSeenContext = createContext<MarkSeenUpTo | null>(null);
const MessagesSliceContext = createContext<MessagesSlice | null>(null);
const DraftsContext = createContext<Record<string, string> | null>(null);
const ConnectionContext = createContext<{ status: ConnectionStatus } | null>(
  null,
);
const InboxContext = createContext<InboxSlice | null>(null);

const INBOX_REFRESH_DEBOUNCE_MS = 400;
/** Catch-up poll interval; only runs while the channel is not SUBSCRIBED. */
const CATCH_UP_POLL_MS = 20000;
/** Minimum gap between focus/visibility driven refetches. */
const FOCUS_REFETCH_MIN_GAP_MS = 1500;

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
        base.messageCursors[initialConversationId] = messagePageNextCursor(initialMessages);
      }
      if (initialConversationId && initialDetail) {
        base.detailsByConversation[initialConversationId] = initialDetail;
      }
      return base;
    },
  );

  // The reducer only seeds from props once; re-sync when the server hands this
  // mounted provider a new page (router.refresh, switching conversations).
  const seededMessagesRef = useRef(initialMessages);
  useEffect(() => {
    if (seededMessagesRef.current === initialMessages) {
      return;
    }
    seededMessagesRef.current = initialMessages;
    if (!initialConversationId || !initialMessages) {
      return;
    }
    dispatch({
      type: "messages/set",
      conversationId: initialConversationId,
      items: initialMessages,
      hasMore: initialMessagesHasMore ?? false,
      cursor: messagePageNextCursor(initialMessages),
    });
    if (initialDetail) {
      dispatch({
        type: "detail/set",
        conversationId: initialConversationId,
        detail: initialDetail,
      });
    }
  }, [initialConversationId, initialDetail, initialMessages, initialMessagesHasMore]);

  useEffect(() => {
    dispatch({ type: "drafts/hydrate", drafts: readDraftsFromStorage() });
  }, []);

  useEffect(() => {
    writeDraftsToStorage(state.drafts);
  }, [state.drafts]);

  const cursorsRef = useRef(state.messageCursors);
  cursorsRef.current = state.messageCursors;
  const pendingSendsRef = useRef(state.pendingSends);
  const connectionStatusRef = useRef(state.connectionStatus);
  const inFlightRef = useRef(new Set<string>());

  useEffect(() => {
    pendingSendsRef.current = state.pendingSends;
    connectionStatusRef.current = state.connectionStatus;
  }, [state.pendingSends, state.connectionStatus]);

  // Socket health and browser connectivity are tracked apart: "offline" wins
  // while the browser has no network, and the socket status resumes after.
  const socketStatusRef = useRef<"connected" | "reconnecting">("connected");
  const offlineRef = useRef(false);

  const setSocketStatus = useCallback((status: "connected" | "reconnecting") => {
    socketStatusRef.current = status;
    if (!offlineRef.current) {
      dispatch({ type: "connection", status });
    }
  }, []);

  const deliver = useCallback(async (pending: PendingSend) => {
    if (inFlightRef.current.has(pending.clientId)) {
      return;
    }
    if (offlineRef.current) {
      return;
    }
    inFlightRef.current.add(pending.clientId);
    const markFailed = () => {
      pendingSendsRef.current = pendingSendsRef.current.map((p) =>
        p.clientId === pending.clientId ? { ...p, status: "failed" } : p,
      );
      dispatch({
        type: "pending/update",
        clientId: pending.clientId,
        status: "failed",
      });
    };
    try {
      const result = await sendTextAction({
        conversationId: pending.conversationId,
        clientId: pending.clientId,
        body: pending.body,
        replyToId: pending.replyToId,
      });
      if (!result.ok) {
        markFailed();
        return;
      }
      pendingSendsRef.current = pendingSendsRef.current.filter(
        (p) => p.clientId !== pending.clientId,
      );
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
    } catch {
      // A thrown action (network drop mid-request) is retryable by the user,
      // unless the browser went offline: then it stays queued for `online`.
      if (typeof navigator === "undefined" || navigator.onLine !== false) {
        markFailed();
      }
    } finally {
      inFlightRef.current.delete(pending.clientId);
    }
  }, []);

  const flushPending = useCallback(async () => {
    const queue = pendingSendsRef.current.filter((p) => p.status === "pending");
    for (const pending of queue) {
      await deliver(pending);
    }
  }, [deliver]);

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
    for (const pending of pendingSendsRef.current) {
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
        items: page.value.items.map(mapMessageRow),
        hasMore: page.value.hasMore,
        cursor: messagePageNextCursor(page.value.items),
      });
    }
    await flushPending();
  }, [flushPending, initialConversationId, listInbox]);

  const inboxRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshInboxList = useCallback(() => {
    // Whatever reached this client counts as delivered to the sender.
    void markDeliveredAction({});
    void listInbox().then((result) => {
      if (result.ok) {
        dispatch({
          type: "conversations/set",
          items: result.value.items,
          hasMore: result.value.hasMore,
        });
        void getConversationReceiptsAction({
          conversationIds: result.value.items
            .filter((item) => item.type === "direct")
            .map((item) => item.id),
        }).then((receipts) => {
          if (receipts.ok) {
            dispatch({ type: "receipts/set", receipts: receipts.value });
          }
        });
      }
    });
  }, [listInbox]);

  // Acknowledge delivery as soon as the app is open, before any event arrives.
  useEffect(() => {
    refreshInboxList();
  }, [refreshInboxList]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const inbox = joinInbox(supabase, userId);
    const timerRef = inboxRefreshTimerRef;

    const offStatus = inbox.onStatus((status) => {
      if (status === "SUBSCRIBED") {
        if (connectionStatusRef.current === "reconnecting") {
          void reconcile();
        }
        setSocketStatus("connected");
        return;
      }
      if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        setSocketStatus("reconnecting");
      }
    });

    const offChange = inbox.onChange((change) => {
      if (change.table === "conversations") {
        if (change.eventType === "UPDATE") {
          scheduleInboxRefresh(timerRef, refreshInboxList);
        }
        return;
      }
      if (change.table === "conversation_members") {
        if (
          change.eventType === "INSERT" ||
          change.eventType === "UPDATE" ||
          change.eventType === "DELETE"
        ) {
          scheduleInboxRefresh(timerRef, refreshInboxList);
        }
      }
    });

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      offStatus();
      offChange();
      inbox.leave();
    };
  }, [reconcile, refreshInboxList, setSocketStatus, userId]);

  useEffect(() => {
    if (!initialConversationId) {
      return;
    }
    const supabase = createSupabaseBrowserClient();
    const topic = joinConversation(supabase, initialConversationId, userId);

    let disposed = false;
    let subscribed = false;
    let everSubscribed = false;
    let lastSyncAt = 0;
    let syncing = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const refreshDetail = async () => {
      const result = await getConversationAction({
        conversationId: initialConversationId,
      });
      if (!disposed && result.ok) {
        dispatch({
          type: "detail/set",
          conversationId: initialConversationId,
          detail: result.value,
        });
      }
    };

    // Authoritative refetch of the open conversation: covers events missed
    // while the socket was down, the tab was asleep, or auth lagged behind.
    const syncOpenConversation = async () => {
      if (syncing || disposed) {
        return;
      }
      syncing = true;
      lastSyncAt = Date.now();
      try {
        const page = await listMessagesAction({
          conversationId: initialConversationId,
        });
        if (disposed || !page.ok) {
          return;
        }
        dispatch({
          type: "messages/set",
          conversationId: initialConversationId,
          items: page.value.items.map(mapMessageRow),
          hasMore: page.value.hasMore,
          cursor: messagePageNextCursor(page.value.items),
        });
        scheduleInboxRefresh(inboxRefreshTimerRef, refreshInboxList);
        void refreshDetail();
      } finally {
        syncing = false;
      }
    };

    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };
    const startPolling = () => {
      if (!pollTimer) {
        pollTimer = setInterval(() => {
          if (!subscribed) {
            void syncOpenConversation();
          }
        }, CATCH_UP_POLL_MS);
      }
    };

    const onWake = () => {
      if (
        typeof document !== "undefined" &&
        document.visibilityState === "hidden"
      ) {
        return;
      }
      if (Date.now() - lastSyncAt < FOCUS_REFETCH_MIN_GAP_MS) {
        return;
      }
      void syncOpenConversation();
    };
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);
    document.addEventListener("visibilitychange", onWake);
    // Until the first SUBSCRIBED arrives, treat the channel as not live.
    startPolling();

    const offStatus = topic.onStatus((status) => {
      if (status === "SUBSCRIBED") {
        const wasRecovering = everSubscribed && !subscribed;
        subscribed = true;
        everSubscribed = true;
        stopPolling();
        setSocketStatus("connected");
        if (wasRecovering) {
          void syncOpenConversation();
        }
      } else if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        subscribed = false;
        startPolling();
        setSocketStatus("reconnecting");
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
      disposed = true;
      stopPolling();
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
      document.removeEventListener("visibilitychange", onWake);
      offStatus();
      offChange();
      topic.leave();
    };
  }, [initialConversationId, refreshInboxList, setSocketStatus, userId]);

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

      // Sending is a server action and does not depend on the realtime socket.
      await deliver(pending);
    },
    [deliver],
  );

  const retrySend = useCallback(
    async (clientId: string) => {
      const pending = pendingSendsRef.current.find((p) => p.clientId === clientId);
      if (!pending) {
        return;
      }
      dispatch({
        type: "pending/update",
        clientId,
        status: "pending",
      });
      await deliver({ ...pending, status: "pending" });
    },
    [deliver],
  );

  const discardSend = useCallback((clientId: string) => {
    pendingSendsRef.current = pendingSendsRef.current.filter(
      (p) => p.clientId !== clientId,
    );
    dispatch({ type: "pending/remove", clientId });
  }, []);

  const setDraft = useCallback((conversationId: string, text: string) => {
    dispatch({ type: "draft/set", conversationId, text });
  }, []);

  const loadOlderMessages = useCallback(
    async (conversationId: string) => {
      const cursor = cursorsRef.current[conversationId];
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
        items: page.value.items.map(mapMessageRow),
        hasMore: page.value.hasMore,
        cursor: messagePageNextCursor(page.value.items),
      });
    },
    [],
  );

  const refreshConversation = useCallback(async (conversationId: string) => {
    const page = await listMessagesAction({ conversationId });
    if (page.ok) {
      dispatch({
        type: "messages/set",
        conversationId,
        items: page.value.items.map(mapMessageRow),
        hasMore: page.value.hasMore,
        cursor: messagePageNextCursor(page.value.items),
      });
    }
  }, []);

  const markSeenUpTo = useCallback(
    async (conversationId: string, message: TimelineMessage) => {
      const result = await markReadAction({
        conversationId,
        messageId: message.id,
      });
      if (result.ok) {
        dispatch({
          type: "detail/patchOwnRead",
          conversationId,
          lastReadMessageId: result.value.last_read_message_id,
          lastReadAt: result.value.last_read_at,
        });
      }
      return result.ok;
    },
    [],
  );

  // Browser connectivity: queue sends while offline, flush when back online.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const goOffline = () => {
      offlineRef.current = true;
      dispatch({ type: "connection", status: "offline" });
    };
    const goOnline = () => {
      offlineRef.current = false;
      dispatch({ type: "connection", status: socketStatusRef.current });
      void flushPending();
    };
    if (navigator.onLine === false) {
      goOffline();
    }
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, [flushPending]);

  const actions = useMemo<MessagingActions>(
    () => ({
      sendMessage,
      retrySend,
      discardSend,
      setDraft,
      loadOlderMessages,
      refreshConversation,
    }),
    [
      discardSend,
      loadOlderMessages,
      refreshConversation,
      retrySend,
      sendMessage,
      setDraft,
    ],
  );

  const messagesSlice = useMemo<MessagesSlice>(
    () => ({
      messagesByConversation: state.messagesByConversation,
      pendingSends: state.pendingSends,
      detailsByConversation: state.detailsByConversation,
      unreadSeparatorByConversation: state.unreadSeparatorByConversation,
      messagesHasMore: state.messagesHasMore,
    }),
    [
      state.detailsByConversation,
      state.messagesByConversation,
      state.messagesHasMore,
      state.pendingSends,
      state.unreadSeparatorByConversation,
    ],
  );

  const connection = useMemo(
    () => ({ status: state.connectionStatus }),
    [state.connectionStatus],
  );

  const inbox = useMemo<InboxSlice>(
    () => ({
      conversations: state.conversations,
      hasMore: state.conversationsHasMore,
      receipts: state.receiptsByConversation,
    }),
    [
      state.conversations,
      state.conversationsHasMore,
      state.receiptsByConversation,
    ],
  );

  const legacyReceipts = useMemo(() => {
    const map: Record<string, ConversationReceiptStatus> = {};
    for (const [id, receipt] of Object.entries(state.receiptsByConversation)) {
      map[id] = receipt.status;
    }
    return map;
  }, [state.receiptsByConversation]);

  const value = useMemo<MessagingContextValue>(
    () => ({
      state: { ...state, receiptsByConversation: legacyReceipts },
      sendMessage,
      retrySend,
      setDraft,
      loadOlderMessages,
      refreshConversation,
    }),
    [
      legacyReceipts,
      loadOlderMessages,
      refreshConversation,
      retrySend,
      sendMessage,
      setDraft,
      state,
    ],
  );

  return (
    <MessagingContext.Provider value={value}>
      <ActionsContext.Provider value={actions}>
        <MarkSeenContext.Provider value={markSeenUpTo}>
          <MessagesSliceContext.Provider value={messagesSlice}>
            <DraftsContext.Provider value={state.drafts}>
              <ConnectionContext.Provider value={connection}>
                <InboxContext.Provider value={inbox}>
                  {children}
                </InboxContext.Provider>
              </ConnectionContext.Provider>
            </DraftsContext.Provider>
          </MessagesSliceContext.Provider>
        </MarkSeenContext.Provider>
      </ActionsContext.Provider>
    </MessagingContext.Provider>
  );
}

function useRequired<T>(ctx: T | null, name: string): T {
  if (ctx === null) {
    throw new Error(`${name} must be used within MessagingProvider`);
  }
  return ctx;
}

export function useMessaging() {
  return useRequired(useContext(MessagingContext), "useMessaging");
}

/** Stable action callbacks; never re-renders on state changes. */
export function useMessagingActions(): MessagingActions {
  return useRequired(useContext(ActionsContext), "useMessagingActions");
}

/** Marks a conversation read up to `message`; used by `useReadTracker`. */
export function useMarkSeenUpTo(): MarkSeenUpTo {
  return useRequired(useContext(MarkSeenContext), "useMarkSeenUpTo");
}

const NO_MESSAGES: TimelineMessage[] = [];
const NO_PENDING: PendingSend[] = [];

export function useConversationView(conversationId: string): ConversationView {
  const slice = useRequired(
    useContext(MessagesSliceContext),
    "useConversationView",
  );
  const messages = slice.messagesByConversation[conversationId] ?? NO_MESSAGES;
  const allPending = slice.pendingSends;
  const pending = useMemo(() => {
    const filtered = allPending.filter(
      (p) => p.conversationId === conversationId,
    );
    return filtered.length === 0 ? NO_PENDING : filtered;
  }, [allPending, conversationId]);
  const detail = slice.detailsByConversation[conversationId];
  const hasMore = slice.messagesHasMore[conversationId] ?? false;
  const separatorId =
    slice.unreadSeparatorByConversation[conversationId] ?? null;
  return useMemo(
    () => ({ messages, pending, detail, hasMore, separatorId }),
    [messages, pending, detail, hasMore, separatorId],
  );
}

export function useDraft(conversationId: string): string {
  const drafts = useRequired(useContext(DraftsContext), "useDraft");
  return drafts[conversationId] ?? "";
}

export function useConnection(): { status: ConnectionStatus } {
  return useRequired(useContext(ConnectionContext), "useConnection");
}

export function useInbox(): InboxSlice {
  return useRequired(useContext(InboxContext), "useInbox");
}
