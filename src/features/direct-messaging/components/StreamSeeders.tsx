"use client";

import { useRouter } from "next/navigation";
import { memo, Suspense, use, useEffect } from "react";

import { ErrorScreen } from "@/shell/components/ErrorScreen";

import {
  useMessagingSeeding,
  useThreadCached,
  useThreadFailed,
} from "../context/MessagingProvider";
import type { InboxPage, ThreadPage } from "../lib/streamed-pages";
import type { ConversationDetail } from "../types";
import { ThreadSkeleton } from "./Skeletons";

/**
 * Seeders read promises the server pages stream down with `use()` and write the
 * result into the app-wide messaging store. They render no UI of their own,
 * except the failed-thread retry screen.
 */

type InboxSeedProps = {
  inbox: Promise<InboxPage>;
  /** False while the URL carries inbox filters this default page does not match. */
  enabled: boolean;
};

function InboxSeedReader({ inbox, enabled }: InboxSeedProps) {
  const page = use(inbox);
  const seeding = useMessagingSeeding();
  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (page.failed) {
      seeding.failInbox();
    } else {
      seeding.seedInbox(page.items, page.hasMore);
    }
  }, [enabled, page, seeding]);
  return null;
}

export const InboxSeed = memo(function InboxSeed(props: InboxSeedProps) {
  return (
    <Suspense fallback={null}>
      <InboxSeedReader {...props} />
    </Suspense>
  );
});

type ThreadSeedProps = {
  conversationId: string;
  detail: ConversationDetail;
  thread: Promise<ThreadPage>;
};

function MessagesSeedReader({
  conversationId,
  thread,
}: Pick<ThreadSeedProps, "conversationId" | "thread">) {
  const page = use(thread);
  const seeding = useMessagingSeeding();
  const router = useRouter();
  useEffect(() => {
    if (page.ok) {
      seeding.seedMessages(conversationId, page.items, page.hasMore);
    } else {
      seeding.failThread(conversationId);
    }
  }, [conversationId, page, seeding]);
  if (page.ok) {
    return null;
  }
  // Never show an empty thread for a failed read: the saved messages would
  // look lost. Offer a retry instead.
  return (
    <ErrorScreen
      error={new Error(`list_messages failed: ${page.code}`)}
      reset={() => router.refresh()}
      boundary="conversation"
    />
  );
}

/**
 * Rendered by the conversation page. A conversation already in the store is not
 * read again; otherwise the streamed first page fills the store.
 */
export const ThreadSeed = memo(function ThreadSeed({
  conversationId,
  detail,
  thread,
}: ThreadSeedProps) {
  const seeding = useMessagingSeeding();
  const cached = useThreadCached(conversationId);
  const failed = useThreadFailed(conversationId);
  useEffect(() => {
    seeding.seedDetail(conversationId, detail);
  }, [conversationId, detail, seeding]);

  if (cached && !failed) {
    return null;
  }
  return (
    <Suspense fallback={<ThreadSkeleton />}>
      <MessagesSeedReader conversationId={conversationId} thread={thread} />
    </Suspense>
  );
});
