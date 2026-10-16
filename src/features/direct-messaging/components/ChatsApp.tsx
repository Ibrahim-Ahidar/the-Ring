"use client";

import { useEffect, useMemo, useState } from "react";

import { ChatsLoadingProvider, type ChatsLoading } from "../context/LoadingContext";
import { MessagingProvider } from "../context/MessagingProvider";
import type { InboxFilters } from "../lib/inbox-filters";
import type { InboxPage, ThreadPage } from "../lib/streamed-pages";
import type { ChatsViewer, ConversationDetail } from "../types";
import { ChatsLayout } from "./ChatsLayout";

type Props = {
  userId: string;
  viewer?: ChatsViewer | null;
  /** The chat list; the page renders before it resolves. */
  inbox: Promise<InboxPage>;
  inboxFilters?: InboxFilters;
  activeConversationId?: string;
  initialDetail?: ConversationDetail;
  /** The open thread's first page; the page renders before it resolves. */
  thread?: Promise<ThreadPage>;
};

type ThreadSnapshot = Extract<ThreadPage, { ok: true }>;

// Opening another chat remounts this page, so keep the last pages seen in this
// tab: the list and a revisited thread then show at once while fresh data
// streams in behind them, instead of flashing skeletons again.
const inboxCache = new Map<string, InboxPage>();
const threadCache = new Map<string, ThreadSnapshot>();
const THREAD_CACHE_LIMIT = 30;

function rememberThread(key: string, page: ThreadSnapshot) {
  threadCache.delete(key);
  threadCache.set(key, page);
  if (threadCache.size > THREAD_CACHE_LIMIT) {
    const oldest = threadCache.keys().next().value;
    if (oldest !== undefined) {
      threadCache.delete(oldest);
    }
  }
}

/** The promise's value once it settles; undefined while pending or after it changes. */
function useSettled<T>(promise: Promise<T> | undefined, fallback: T): T | undefined {
  const [settled, setSettled] = useState<{ promise: Promise<T>; value: T } | null>(null);
  useEffect(() => {
    if (!promise) {
      return;
    }
    let live = true;
    promise.then(
      (value) => live && setSettled({ promise, value }),
      () => live && setSettled({ promise, value: fallback }),
    );
    return () => {
      live = false;
    };
    // `fallback` is a constant per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promise]);
  return settled && settled.promise === promise ? settled.value : undefined;
}

const EMPTY_INBOX: InboxPage = { items: [], hasMore: false };
const THREAD_STREAM_FAILED: ThreadPage = { ok: false, code: "stream_failed" };

function ChatsAppInner(props: Props) {
  const { userId, activeConversationId } = props;
  const inboxKey = `${userId}|${props.inboxFilters?.includeArchived ? 1 : 0}|${props.inboxFilters?.folderId ?? ""}`;
  const threadKey = activeConversationId ? `${userId}|${activeConversationId}` : null;

  const freshInbox = useSettled(props.inbox, EMPTY_INBOX);
  const freshThread = useSettled(props.thread, THREAD_STREAM_FAILED);

  useEffect(() => {
    if (freshInbox) {
      inboxCache.set(inboxKey, freshInbox);
    }
  }, [freshInbox, inboxKey]);
  useEffect(() => {
    if (threadKey && freshThread?.ok) {
      rememberThread(threadKey, freshThread);
    }
  }, [freshThread, threadKey]);

  const inbox = freshInbox ?? inboxCache.get(inboxKey);
  const thread = freshThread?.ok
    ? freshThread
    : threadKey
      ? threadCache.get(threadKey)
      : undefined;
  const inboxLoading = !inbox;
  const threadLoading = Boolean(activeConversationId) && !thread;
  const loading = useMemo<ChatsLoading>(
    () => ({
      inbox: inboxLoading,
      thread: threadLoading,
      inboxFailed: Boolean(inbox?.failed),
    }),
    [inboxLoading, threadLoading, inbox?.failed],
  );

  if (freshThread && !freshThread.ok) {
    // Never show an empty thread for a failed read: the saved messages would
    // look lost. The route error boundary offers a retry instead.
    throw new Error(`list_messages failed: ${freshThread.code}`);
  }


  return (
    <ChatsLoadingProvider value={loading}>
      <MessagingProvider
        userId={userId}
        initialConversations={inbox?.items}
        initialConversationsHasMore={inbox?.hasMore}
        inboxFilters={props.inboxFilters}
        initialConversationId={activeConversationId}
        initialDetail={props.initialDetail}
        initialMessages={thread?.items}
        initialMessagesHasMore={thread?.hasMore}
      >
        <ChatsLayout
          userId={userId}
          viewer={props.viewer ?? null}
          activeConversationId={activeConversationId}
          threadDetail={props.initialDetail}
        />
      </MessagingProvider>
    </ChatsLoadingProvider>
  );
}

export const ChatsApp = ChatsAppInner;
