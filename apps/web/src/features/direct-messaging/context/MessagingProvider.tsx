"use client";

import { useDesktopBridge } from "./useDesktopBridge";
import { VIEWPORT_COOKIE } from "../lib/page-limit";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type MutableRefObject,
  type ReactNode,
} from "react";

import { isE2eeEnabled } from "@pulse/core/e2ee-flag";
import { emitComposerActivity } from "@/platform/composer-events";
import { joinConversation, joinInbox } from "@/platform/realtime-hub";
import { timingArrival, timingTapStart } from "@/platform/timing/hooks";
import { createSupabaseBrowserClient } from "@/platform/supabase/browser";
import type { TimelineMessage } from "@pulse/core/timeline";
import { randomUUID } from "@pulse/core/uuid";

import { getMessageAttachmentsAction } from "@/features/media/actions";

import {
  getConversationAction,
  getConversationReceiptsAction,
  getArchivedSummaryAction,
  markDeliveredAction,
  markReadAction,
  sendTextAction,
} from "../actions";
import {
  readMessages,
  refreshConversations,
  refreshMessages,
  storeRealtimeMessage,
} from "../lib/data-source";
import { needsAttachmentFetch } from "../lib/realtime-message";
import { getTextOutbox, setTextOutboxEvents } from "../lib/text-outbox";
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
  DEFAULT_INBOX_FILTERS,
  type InboxFilters,
} from "../lib/inbox-filters";
import { ChatsLoadingProvider, type ChatsLoading } from "./LoadingContext";
import { rowToTimelineMessage } from "./map-row";
import { createDraftStore, type DraftStore } from "./draft-store";
import { createInitialState, messagingReducer } from "./reducer";
import {
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
  clearLive: (clientId: string) => void;
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

/**
 * Hands server-streamed pages to the store. Pages stay dumb: they pass
 * promises, small client seeders read them with `use()` and call these.
 */
export type MessagingSeeding = {
  seedInbox: (items: ConversationSummary[], hasMore: boolean) => void;
  failInbox: () => void;
  markInboxLoading: () => void;
  seedDetail: (conversationId: string, detail: ConversationDetail) => void;
  seedMessages: (
    conversationId: string,
    items: TimelineMessage[],
    hasMore: boolean,
  ) => void;
  failThread: (conversationId: string) => void;
  /** Filters the realtime inbox refresh applies; chats screens set them. */
  setInboxFilters: (filters: InboxFilters) => void;
};

const SeedingContext = createContext<MessagingSeeding | null>(null);
const ActiveConversationContext = createContext<string | undefined>(undefined);
const MessagingContext = createContext<MessagingContextValue | null>(null);
const ActionsContext = createContext<MessagingActions | null>(null);
const MarkSeenContext = createContext<MarkSeenUpTo | null>(null);
const ViewerIdContext = createContext<string | null>(null);
const MessagesSliceContext = createContext<MessagesSlice | null>(null);
const ThreadFailedContext = createContext<Record<string, boolean> | null>(null);
const DraftsContext = createContext<DraftStore | null>(null);
const ConnectionContext = createContext<{ status: ConnectionStatus } | null>(
  null,
);
const InboxContext = createContext<InboxSlice | null>(null);

/** Conversations kept subscribed (and cached) at once; the oldest is dropped. */
const WATCHED_CONVERSATIONS_LIMIT = 8;
const NON_CONVERSATION_SEGMENTS = new Set(["new", "requests"]);

/** The open conversation id for /app/chats/<id> paths, else undefined. */
export function conversationIdFromPath(pathname: string | null): string | undefined {
  const [app, section, id] = (pathname ?? "").split("/").filter(Boolean);
  if (app !== "app" || section !== "chats" || !id || NON_CONVERSATION_SEGMENTS.has(id)) {
    return undefined;
  }
  return id;
}

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

type ProviderProps = {
  userId: string;
  /** Undefined while the list is still streaming in. */
  initialConversations?: ConversationSummary[];
  initialConversationsHasMore?: boolean;
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
  const pathname = usePathname();
  const activeConversationId =
    initialConversationId ?? conversationIdFromPath(pathname);
  const inboxFiltersRef = useRef(inboxFilters);

  const listInbox = useCallback(async () => {
    const args = inboxFiltersToListArgs(
      inboxFiltersRef.current ?? DEFAULT_INBOX_FILTERS,
    );
    return refreshConversations(args);
  }, []);
  const [state, dispatch] = useReducer(
    messagingReducer,
    userId,
    (id) => {
      const base = createInitialState(id);
      base.inboxStatus = initialConversations ? "ready" : "loading";
      base.conversations = initialConversations ?? [];
      base.conversationsHasMore = initialConversationsHasMore ?? false;
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

  const [draftStore] = useState(createDraftStore);

  // Tell the server the viewport height so a chat opens with about three screens of rows.
  useEffect(() => {
    const report = () => {
      document.cookie = `${VIEWPORT_COOKIE}=${window.innerHeight}; path=/; max-age=31536000; samesite=lax`;
    };
    report();
    window.addEventListener("resize", report);
    return () => window.removeEventListener("resize", report);
  }, []);

  useEffect(() => {
    window.addEventListener("pagehide", draftStore.flush);
    return () => {
      window.removeEventListener("pagehide", draftStore.flush);
      draftStore.flush();
    };
  }, [draftStore]);

  const cursorsRef = useRef(state.messageCursors);
  cursorsRef.current = state.messageCursors;
  const pendingSendsRef = useRef(state.pendingSends);
  const connectionStatusRef = useRef(state.connectionStatus);
  const inFlightRef = useRef(new Set<string>());
  /** Conversations with a live subscription, oldest first. */
  const watchedIdsRef = useRef<string[]>([]);

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
    // With the e2ee flag on the outbox drainer owns redelivery.
    if (isE2eeEnabled()) return;
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
    const openIds = new Set(watchedIdsRef.current);
    for (const pending of pendingSendsRef.current) {
      openIds.add(pending.conversationId);
    }
    for (const conversationId of openIds) {
      const page = await refreshMessages(conversationId);
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
  }, [flushPending, listInbox]);

  const inboxRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshInboxList = useCallback(() => {
    // Whatever reached this client counts as delivered to the sender.
    void markDeliveredAction({});
    void getArchivedSummaryAction().then((summary) => {
      if (summary.ok) {
        dispatch({ type: "archived/set", summary: summary.value });
      }
    });
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

  const watchConversation = useCallback((conversationId: string): (() => void) => {
    const supabase = createSupabaseBrowserClient();
    const topic = joinConversation(supabase, conversationId, userId);

    let disposed = false;
    let subscribed = false;
    let everSubscribed = false;
    let lastSyncAt = 0;
    let syncing = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const refreshDetail = async () => {
      const result = await getConversationAction({
        conversationId: conversationId,
      });
      if (!disposed && result.ok) {
        dispatch({
          type: "detail/set",
          conversationId: conversationId,
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
        const page = await refreshMessages(conversationId);
        if (disposed || !page.ok) {
          return;
        }
        dispatch({
          type: "messages/set",
          conversationId: conversationId,
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
      void storeRealtimeMessage(row).catch(() => {});
      const message = rowToTimelineMessage(row);
      if (!message) {
        return;
      }
      dispatch({
        type: "messages/upsert",
        conversationId: conversationId,
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
              conversationId: conversationId,
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
            conversationId: conversationId,
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
            conversationId: conversationId,
          }).then((result) => {
            if (result.ok) {
              dispatch({
                type: "detail/set",
                conversationId: conversationId,
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
        if (change.eventType === "INSERT" && change.new.sender_id !== userId && typeof change.new.created_at === "string") {
          timingArrival(change.new.created_at);
        }
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
  }, [refreshInboxList, setSocketStatus, userId]);

  // Subscriptions outlive the open chat so a revisited thread is already
  // current and needs no refetch. They are dropped with the provider.
  const watchersRef = useRef(new Map<string, () => void>());
  useEffect(() => {
    if (!activeConversationId) {
      return;
    }
    const watchers = watchersRef.current;
    const ids = watchedIdsRef.current;
    const at = ids.indexOf(activeConversationId);
    if (at !== -1) {
      ids.splice(at, 1);
    }
    ids.push(activeConversationId);
    if (!watchers.has(activeConversationId)) {
      watchers.set(activeConversationId, watchConversation(activeConversationId));
    }
    while (ids.length > WATCHED_CONVERSATIONS_LIMIT) {
      const oldest = ids.shift();
      if (oldest === undefined) {
        break;
      }
      watchers.get(oldest)?.();
      watchers.delete(oldest);
      dispatch({ type: "messages/evict", conversationId: oldest });
    }
  }, [activeConversationId, watchConversation]);
  useEffect(() => {
    const watchers = watchersRef.current;
    const ids = watchedIdsRef.current;
    return () => {
      for (const stop of watchers.values()) {
        stop();
      }
      watchers.clear();
      ids.length = 0;
    };
  }, []);

  const sendMessage = useCallback(
    async (input: {
      conversationId: string;
      body: string;
      replyToId?: string | null;
    }) => {
      const clientId = randomUUID();
      timingTapStart(clientId);
      const pending: PendingSend = {
        clientId,
        conversationId: input.conversationId,
        body: input.body,
        replyToId: input.replyToId,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      dispatch({ type: "pending/add", pending });
      draftStore.set(input.conversationId, "");

      // e2ee flag on: the send is persisted in the local outbox and drained from there.
      if (isE2eeEnabled()) {
        const box = await getTextOutbox(userId);
        if (box) {
          pendingSendsRef.current = [...pendingSendsRef.current, pending];
          await box.enqueueText(pending, pending.createdAt);
          return;
        }
      }

      // Sending is a server action and does not depend on the realtime socket.
      await deliver(pending);
    },
    [deliver, draftStore, userId],
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
      if (isE2eeEnabled()) {
        const box = await getTextOutbox(userId);
        if (box) {
          await box.enqueueText(pending, pending.createdAt);
          return;
        }
      }
      await deliver({ ...pending, status: "pending" });
    },
    [deliver, userId],
  );

  const discardSend = useCallback((clientId: string) => {
    pendingSendsRef.current = pendingSendsRef.current.filter(
      (p) => p.clientId !== clientId,
    );
    dispatch({ type: "pending/remove", clientId });
  }, []);

  const setDraft = useCallback(
    (conversationId: string, text: string) => draftStore.set(conversationId, text),
    [draftStore],
  );

  const loadOlderMessages = useCallback(
    async (conversationId: string) => {
      const cursor = cursorsRef.current[conversationId];
      if (!cursor) {
        return;
      }
      const page = await readMessages({ conversationId, cursor });
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
    const page = await refreshMessages(conversationId);
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

  // e2ee flag on: outbox results update the UI; unsent sends of an earlier session come back.
  useEffect(() => {
    if (!isE2eeEnabled()) {
      return;
    }
    let cancelled = false;
    setTextOutboxEvents({
      onSent(clientId, message) {
        const conversationId = message.conversation_id;
        pendingSendsRef.current = pendingSendsRef.current.filter((p) => p.clientId !== clientId);
        dispatch({ type: "pending/remove", clientId });
        dispatch({ type: "messages/upsert", conversationId, message });
        emitComposerActivity({ kind: "sent", conversationId });
      },
      onFailed(clientId) {
        pendingSendsRef.current = pendingSendsRef.current.map((p) =>
          p.clientId === clientId ? { ...p, status: "failed" } : p,
        );
        dispatch({ type: "pending/update", clientId, status: "failed" });
      },
    });
    void getTextOutbox(userId).then(async (box) => {
      if (!box || cancelled) return;
      const unsent = await box.listPending();
      for (const p of unsent) {
        if (pendingSendsRef.current.some((x) => x.clientId === p.clientId)) continue;
        pendingSendsRef.current = [...pendingSendsRef.current, p];
        dispatch({ type: "pending/add", pending: p });
      }
    });
    const onOnline = () => void getTextOutbox(userId).then((b) => b?.drain({ force: true }));
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
    };
  }, [userId]);

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

  useDesktopBridge(state, activeConversationId);

  const seeding = useMemo<MessagingSeeding>(
    () => ({
      seedInbox: (items, hasMore) =>
        dispatch({ type: "conversations/set", items, hasMore }),
      failInbox: () => dispatch({ type: "inbox/failed" }),
      markInboxLoading: () => dispatch({ type: "inbox/loading" }),
      seedDetail: (conversationId, detail) =>
        dispatch({ type: "detail/set", conversationId, detail }),
      seedMessages: (conversationId, items, hasMore) => {
        dispatch({
          type: "messages/set",
          conversationId,
          items,
          hasMore,
          cursor: messagePageNextCursor(items),
        });
      },
      failThread: (conversationId) =>
        dispatch({ type: "thread/failed", conversationId }),
      setInboxFilters: (filters) => {
        inboxFiltersRef.current = filters;
      },
    }),
    [],
  );

  // Unread separator for a seeded thread: the first message past the read marker.
  const separatorSeedRef = useRef(new Set<string>());
  useEffect(() => {
    if (!activeConversationId || separatorSeedRef.current.has(activeConversationId)) {
      return;
    }
    const detail = state.detailsByConversation[activeConversationId];
    const messages = state.messagesByConversation[activeConversationId];
    if (!detail || !messages) {
      return;
    }
    separatorSeedRef.current.add(activeConversationId);
    dispatch({
      type: "unreadSeparator/set",
      conversationId: activeConversationId,
      messageId: firstUnreadMessageId(messages, detail.last_read_message_id, userId),
    });
  }, [activeConversationId, state.detailsByConversation, state.messagesByConversation, userId]);

  const loading = useMemo<ChatsLoading>(
    () => ({
      inbox: state.inboxStatus === "loading",
      inboxFailed: state.inboxStatus === "failed",
    }),
    [state.inboxStatus],
  );

  const clearLive = useCallback(
    (clientId: string) => dispatch({ type: "live/clear", clientId }),
    [],
  );

  const actions = useMemo<MessagingActions>(
    () => ({
      sendMessage,
      retrySend,
      discardSend,
      clearLive,
      setDraft,
      loadOlderMessages,
      refreshConversation,
    }),
    [
      clearLive,
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
      clearLive,
      setDraft,
      loadOlderMessages,
      refreshConversation,
    }),
    [
      clearLive,
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
    <ChatsLoadingProvider value={loading}>
    <SeedingContext.Provider value={seeding}>
    <ActiveConversationContext.Provider value={activeConversationId}>
    <MessagingContext.Provider value={value}>
      <ActionsContext.Provider value={actions}>
        <ViewerIdContext.Provider value={userId}>
        <MarkSeenContext.Provider value={markSeenUpTo}>
          <MessagesSliceContext.Provider value={messagesSlice}>
            <ThreadFailedContext.Provider value={state.threadFailed}>
            <DraftsContext.Provider value={draftStore}>
              <ConnectionContext.Provider value={connection}>
                <InboxContext.Provider value={inbox}>
                  {children}
                </InboxContext.Provider>
              </ConnectionContext.Provider>
            </DraftsContext.Provider>
            </ThreadFailedContext.Provider>
          </MessagesSliceContext.Provider>
        </MarkSeenContext.Provider>
        </ViewerIdContext.Provider>
      </ActionsContext.Provider>
    </MessagingContext.Provider>
    </ActiveConversationContext.Provider>
    </SeedingContext.Provider>
    </ChatsLoadingProvider>
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

/** Whether a conversation's first message page is already in the store. */
export function useThreadCached(conversationId: string): boolean {
  const slice = useRequired(useContext(MessagesSliceContext), "useThreadCached");
  return slice.messagesByConversation[conversationId] !== undefined;
}

/** Whether a conversation's first message page failed to load. */
export function useThreadFailed(conversationId: string): boolean {
  const failed = useRequired(useContext(ThreadFailedContext), "useThreadFailed");
  return failed[conversationId] === true;
}

/** Store-writing hooks for the small client seeders that read streamed server promises. */
export function useMessagingSeeding(): MessagingSeeding {
  return useRequired(useContext(SeedingContext), "useMessagingSeeding");
}

/** The conversation id in the URL (undefined on the list and other routes). */
export function useActiveConversationId(): string | undefined {
  return useContext(ActiveConversationContext);
}

/** Stable action callbacks; never re-renders on state changes. */
export function useMessagingActions(): MessagingActions {
  return useRequired(useContext(ActionsContext), "useMessagingActions");
}

/** The signed-in user's id. */
export function useViewerId(): string | null {
  return useContext(ViewerIdContext);
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
  const store = useRequired(useContext(DraftsContext), "useDraft");
  return useSyncExternalStore(
    store.subscribe,
    () => store.get(conversationId),
    () => "",
  );
}

export function useConnection(): { status: ConnectionStatus } {
  return useRequired(useContext(ConnectionContext), "useConnection");
}

export function useInbox(): InboxSlice {
  return useRequired(useContext(InboxContext), "useInbox");
}
