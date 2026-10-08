"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";

import { createSupabaseBrowserClient } from "@/platform/supabase/browser";
import { joinInbox } from "@/platform/realtime-hub";

import {
  fetchNotificationsPageAction,
  fetchUnreadCountAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "../actions";
import { encodeNotificationCursor } from "../cursor";
import type { NotificationRow } from "../types";
import {
  initialNotificationsState,
  notificationsReducer,
} from "./notifications-reducer";

type NotificationsContextValue = {
  state: typeof initialNotificationsState;
  reload: () => void;
  loadMore: () => void;
  markOneRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(
  null,
);

function mapRealtimeRow(raw: Record<string, unknown>): NotificationRow | null {
  const id = raw.id;
  if (typeof id !== "string") {
    return null;
  }
  return {
    id,
    type: typeof raw.type === "string" ? raw.type : "",
    actorId: typeof raw.actor_id === "string" ? raw.actor_id : null,
    actorUsername: null,
    entityId: typeof raw.entity_id === "string" ? raw.entity_id : null,
    conversationId:
      typeof raw.conversation_id === "string" ? raw.conversation_id : null,
    readAt: typeof raw.read_at === "string" ? raw.read_at : null,
    createdAt:
      typeof raw.created_at === "string"
        ? raw.created_at
        : new Date().toISOString(),
  };
}

export function NotificationsProvider({
  userId,
  children,
}: {
  userId: string;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(
    notificationsReducer,
    initialNotificationsState,
  );

  const loadInitial = useCallback(async () => {
    dispatch({ type: "load_start" });
    const [page, count] = await Promise.all([
      fetchNotificationsPageAction(null),
      fetchUnreadCountAction(),
    ]);

    if (!page.ok) {
      dispatch({ type: "load_error", code: page.error.code });
      return;
    }
    if (!count.ok) {
      dispatch({ type: "load_error", code: count.error.code });
      return;
    }

    dispatch({
      type: "load_success",
      items: page.value.items,
      unreadCount: count.value,
      nextCursor: page.value.nextCursor,
    });
  }, []);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      return;
    }

    const handle = joinInbox(supabase, userId);
    const remove = handle.onChange((change) => {
      if (
        change.table !== "notifications" ||
        change.eventType !== "INSERT"
      ) {
        return;
      }
      const row = mapRealtimeRow(change.new);
      if (row) {
        dispatch({ type: "prepend", row });
      }
    });

    return () => {
      remove();
      handle.leave();
    };
  }, [userId]);

  const loadMore = useCallback(async () => {
    if (!state.nextCursor || state.loadingMore) {
      return;
    }
    dispatch({ type: "load_more_start" });
    const encoded = encodeNotificationCursor(state.nextCursor);
    const page = await fetchNotificationsPageAction(encoded);
    if (!page.ok) {
      dispatch({ type: "load_error", code: page.error.code });
      return;
    }
    dispatch({
      type: "load_more_success",
      items: page.value.items,
      nextCursor: page.value.nextCursor,
    });
  }, [state.nextCursor, state.loadingMore]);

  const markOneRead = useCallback(async (id: string) => {
    const result = await markNotificationReadAction(id);
    if (result.ok) {
      dispatch({
        type: "mark_read",
        id,
        readAt: new Date().toISOString(),
      });
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const result = await markAllNotificationsReadAction();
    if (result.ok) {
      dispatch({
        type: "mark_all_read",
        readAt: new Date().toISOString(),
      });
    }
  }, []);

  const value = useMemo(
    () => ({
      state,
      reload: loadInitial,
      loadMore,
      markOneRead,
      markAllRead,
    }),
    [state, loadInitial, loadMore, markOneRead, markAllRead],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationsProvider");
  }
  return ctx;
}

/** Lightweight unread subscription for the nav badge (no list state). */
export function useNotificationsUnreadBadge(userId: string): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchUnreadCountAction();
      if (!cancelled && result.ok) {
        setCount(result.value);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      return;
    }
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      return;
    }
    const handle = joinInbox(supabase, userId);
    const removeChange = handle.onChange((change) => {
      if (change.table !== "notifications") {
        return;
      }
      if (change.eventType === "INSERT") {
        const readAt = change.new.read_at;
        if (readAt == null) {
          setCount((prev) => prev + 1);
        }
        return;
      }
      if (change.eventType === "UPDATE") {
        const wasUnread = change.old.read_at == null;
        const isUnread = change.new.read_at == null;
        if (wasUnread && !isUnread) {
          setCount((prev) => Math.max(0, prev - 1));
        } else if (!wasUnread && isUnread) {
          setCount((prev) => prev + 1);
        }
      }
    });
    return () => {
      removeChange();
      handle.leave();
    };
  }, [userId]);

  return count;
}
