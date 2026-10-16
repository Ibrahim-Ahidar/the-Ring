"use client";

import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFormatter, useNow, useTimeZone, useTranslations } from "next-intl";

import { useGroupMemberDirectory } from "@/features/groups/hooks/useGroupMemberNames";
import type { TimelineMessage } from "@/platform/timeline";

import { shouldGroupWithPrevious } from "../delivery";
import { calendarDaysAgo, isSameCalendarDay } from "../lib/calendar";
import { useReadTracker } from "../hooks/useReadReceipts";
import { useHydrated } from "../lib/use-hydrated";
import { conversationTitle } from "../lib/titles";
import type { ConversationDetail } from "../types";
import type { PendingSend } from "../context/types";
import { useChatsLoading } from "../context/LoadingContext";
import { useMessaging } from "../context/MessagingProvider";
import { MessageBubble } from "./MessageBubble";
import { ThreadSkeleton } from "./Skeletons";
import styles from "../direct-messaging.module.css";

type Props = {
  conversationId: string;
  conversationType: "direct" | "group";
  currentUserId: string;
  detail?: ConversationDetail;
};

type Quote = { self: boolean; author: string | null; text: string };

/** Distance from the bottom (px) within which new messages keep the view pinned. */
const STICK_THRESHOLD = 80;

const NO_MESSAGES: TimelineMessage[] = [];

function pendingAsMessage(pending: PendingSend): TimelineMessage {
  return {
    id: `pending-${pending.clientId}`,
    conversation_id: pending.conversationId,
    sender_id: "",
    client_id: pending.clientId,
    type: "text",
    body: pending.body,
    reply_to_id: pending.replyToId ?? null,
    created_at: pending.createdAt,
    edited_at: null,
    deleted_at: null,
    deletion_scope: "none",
    pinned_at: null,
    forwarded: false,
    metadata: null,
    status: pending.status,
  };
}

function MessageTimelineInner({
  conversationId,
  conversationType,
  currentUserId,
  detail,
}: Props) {
  const t = useTranslations("direct-messaging");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const timeZone = useTimeZone() ?? "UTC";
  const hydrated = useHydrated();
  const { state, retrySend, loadOlderMessages } = useMessaging();
  const { thread: loading } = useChatsLoading();
  const stored = state.messagesByConversation[conversationId] ?? NO_MESSAGES;
  const pending = useMemo(
    () => state.pendingSends.filter((p) => p.conversationId === conversationId),
    [conversationId, state.pendingSends],
  );
  const separatorId =
    state.unreadSeparatorByConversation[conversationId] ?? null;
  const scrollRef = useRef<HTMLDivElement>(null);
  const track = useReadTracker(conversationId, scrollRef);
  const stickToBottom = useRef(true);
  const scrolledConversation = useRef<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const anchor = useRef<{ height: number; top: number; firstId: string | undefined } | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [seenLastId, setSeenLastId] = useState<string | undefined>(undefined);
  const hasMore = Boolean(state.messagesHasMore[conversationId]);

  const timeline = useMemo(() => {
    const pendingMessages = pending.map((entry) => ({
      ...pendingAsMessage(entry),
      sender_id: currentUserId,
    }));
    const merged = [...stored, ...pendingMessages].sort((a, b) => {
      if (a.created_at !== b.created_at) {
        return a.created_at < b.created_at ? 1 : -1;
      }
      return a.id < b.id ? 1 : -1;
    });
    return [...merged].reverse();
  }, [currentUserId, pending, stored]);

  const isGroup = conversationType === "group";
  const members = useGroupMemberDirectory(conversationId, isGroup);
  const otherName = detail && detail.type === "direct" ? conversationTitle(detail, t) : null;
  const nameOf = useCallback(
    (senderId: string): string | null =>
      isGroup ? (members.get(senderId)?.name ?? t("unknownSender")) : otherName,
    [isGroup, members, otherName, t],
  );

  const quotes = useMemo(() => {
    const byId = new Map<string, TimelineMessage>();
    for (const message of stored) {
      byId.set(message.id, message);
    }
    const result = new Map<string, Quote>();
    for (const message of timeline) {
      if (!message.reply_to_id) {
        continue;
      }
      const quoted = byId.get(message.reply_to_id);
      if (!quoted) {
        result.set(message.id, { self: false, author: null, text: t("replyQuote") });
        continue;
      }
      const self = quoted.sender_id === currentUserId;
      const text =
        quoted.deletion_scope === "everyone"
          ? t("messageDeleted")
          : quoted.body?.trim() ||
            (quoted.type === "image"
              ? t("quotedPhoto")
              : quoted.type === "audio"
                ? t("quotedVoice")
                : quoted.type === "file"
                  ? t("quotedFile")
                  : t("replyQuote"));
      result.set(message.id, { self, author: self ? t("you") : nameOf(quoted.sender_id), text });
    }
    return result;
  }, [currentUserId, nameOf, stored, t, timeline]);

  const last = timeline[timeline.length - 1];
  const lastId = last?.id;
  const lastIsMine = last?.sender_id === currentUserId;

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    const switched = scrolledConversation.current !== conversationId;
    if (switched || stickToBottom.current || lastIsMine) {
      node.scrollTop = node.scrollHeight;
      stickToBottom.current = true;
    }
    scrolledConversation.current = conversationId;
  }, [conversationId, lastId, lastIsMine]);

  const firstId = timeline[0]?.id;

  // Keep the message under the reader's eye in place after older pages are prepended.
  useLayoutEffect(() => {
    const node = scrollRef.current;
    const saved = anchor.current;
    if (!node || !saved || saved.firstId === firstId) {
      return;
    }
    node.scrollTop = saved.top + (node.scrollHeight - saved.height);
    anchor.current = null;
  }, [firstId]);

  const loadOlder = useCallback(async () => {
    const node = scrollRef.current;
    if (loadingRef.current || !node) {
      return;
    }
    loadingRef.current = true;
    setLoadingOlder(true);
    anchor.current = { height: node.scrollHeight, top: node.scrollTop, firstId };
    try {
      await loadOlderMessages(conversationId);
    } finally {
      loadingRef.current = false;
      setLoadingOlder(false);
    }
  }, [conversationId, firstId, loadOlderMessages]);

  const loadOlderRef = useRef(loadOlder);
  useEffect(() => {
    loadOlderRef.current = loadOlder;
  }, [loadOlder]);

  useEffect(() => {
    const target = topRef.current;
    const root = scrollRef.current;
    if (!hasMore || !target || !root || typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadOlderRef.current();
        }
      },
      { root, rootMargin: "200px 0px 0px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, conversationId, loadingOlder]);

  const onScroll = useCallback(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    const near = node.scrollHeight - node.scrollTop - node.clientHeight < STICK_THRESHOLD;
    stickToBottom.current = near;
    setAtBottom(near);
  }, []);

  useEffect(() => {
    if (atBottom) {
      setSeenLastId(lastId);
    }
  }, [atBottom, lastId]);

  const unreadBelow = useMemo(() => {
    if (atBottom) {
      return 0;
    }
    const from = seenLastId ? timeline.findIndex((m) => m.id === seenLastId) + 1 : 0;
    return timeline.slice(from).filter((m) => m.sender_id !== currentUserId).length;
  }, [atBottom, currentUserId, seenLastId, timeline]);

  const jumpToLatest = useCallback(() => {
    const node = scrollRef.current;
    if (!node) {
      return;
    }
    node.scrollTo?.({ top: node.scrollHeight, behavior: "smooth" });
    stickToBottom.current = true;
  }, []);

  const dayLabel = (iso: string): string => {
    const date = new Date(iso);
    const daysAgo = calendarDaysAgo(date, now, timeZone);
    if (daysAgo <= 0) {
      return t("today");
    }
    if (daysAgo === 1) {
      return t("yesterday");
    }
    if (daysAgo < 7) {
      return format.dateTime(date, { weekday: "long" });
    }
    return format.dateTime(date, { dateStyle: "long" });
  };

  return (
    <div
      ref={scrollRef}
      className={styles.messages}
      role="log"
      aria-label={t("threadLabel")}
      onScroll={onScroll}
    >
      <div className={styles.messagesInner}>
        {hasMore ? (
          <>
            <div ref={topRef} aria-hidden="true" />
            <button
              type="button"
              className={styles.loadOlder}
              disabled={loadingOlder}
              aria-busy={loadingOlder}
              onClick={() => void loadOlder()}
            >
              {loadingOlder ? (
                <span className={styles.spinner} role="status" aria-label={t("loadingOlder")} />
              ) : (
                t("loadOlder")
              )}
            </button>
          </>
        ) : null}
        {timeline.length === 0 ? (
          loading ? <ThreadSkeleton /> : <p className={styles.systemNote}>{t("emptyThread")}</p>
        ) : null}
        {timeline.map((message, index) => {
          const previous = timeline[index - 1];
          const newDay = !previous || !isSameCalendarDay(previous.created_at, message.created_at, timeZone);
          const showSeparator = separatorId === message.id;
          const grouped =
            !newDay && !showSeparator && shouldGroupWithPrevious(message, previous);
          const pendingEntry = pending.find((p) => p.clientId === message.client_id);
          const quote = quotes.get(message.id);
          return (
            <Fragment key={message.id}>
              {newDay ? (
                <p className={styles.dayDivider}>
                  <time dateTime={message.created_at}>
                    {hydrated ? dayLabel(message.created_at) : null}
                  </time>
                </p>
              ) : null}
              {showSeparator ? <p className={styles.unreadDivider}>{t("newMessages")}</p> : null}
              <MessageBubble
                message={message}
                conversationId={conversationId}
                currentUserId={currentUserId}
                conversationType={conversationType}
                detail={detail}
                pendingStatus={pendingEntry?.status}
                grouped={grouped}
                senderName={isGroup ? nameOf(message.sender_id) : null}
                senderAvatarUrl={members.get(message.sender_id)?.avatarUrl ?? null}
                quoteSelf={quote?.self}
                quoteAuthor={quote?.author}
                quoteText={quote?.text}
                onRetry={retrySend}
                rowRef={track(message)}
              />
            </Fragment>
          );
        })}
      </div>
      {!atBottom ? (
        <button type="button" className={styles.jumpLatest} onClick={jumpToLatest}>
          <span aria-hidden="true">↓</span>
          {unreadBelow > 0 ? t("newMessagesCount", { count: unreadBelow }) : t("jumpToLatest")}
        </button>
      ) : null}
    </div>
  );
}

export const MessageTimeline = memo(MessageTimelineInner);
