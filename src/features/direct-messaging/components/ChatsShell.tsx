"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { PaneLayout } from "@/shell/components/PaneLayout";

import { listConversationsAction } from "../actions";
import {
  useActiveConversationId,
  useMessaging,
  useMessagingSeeding,
} from "../context/MessagingProvider";
import { inboxFiltersToListArgs, parseInboxFilters } from "../lib/inbox-filters";
import type { InboxPage } from "../lib/streamed-pages";
import type { ChatsViewer } from "../types";
import { ChatsSidebar } from "./ChatsSidebar";
import { ChatsWelcome } from "./ChatsWelcome";
import { ConversationDrawer } from "./ConversationDrawer";
import { InboxSeed } from "./StreamSeeders";
import { ThreadPanel } from "./ThreadPanel";

type Props = {
  userId: string;
  viewer: ChatsViewer | null;
  /** The default (unfiltered) chat list, streamed from the layout. */
  inbox: Promise<InboxPage>;
  /** The routed page: seeds the store and shows loading, not-found or error states. */
  children: ReactNode;
};

/**
 * The persistent chats frame, mounted by the chats layout: the sidebar stays
 * mounted while the open conversation changes. The thread renders straight from
 * the app-wide store, so a conversation seen before shows with no round trip;
 * the routed page (`children`) only fills the store.
 */
export function ChatsShell({ userId, viewer, inbox, children }: Props) {
  const t = useTranslations("direct-messaging");
  const searchParams = useSearchParams();
  const seeding = useMessagingSeeding();
  const { state } = useMessaging();
  const activeId = useActiveConversationId();

  const includeArchived = searchParams.get("archived") === "1";
  const folderId = searchParams.get("folder")?.trim() || null;
  const filtered = includeArchived || folderId !== null;

  // The layout streams the unfiltered list; any filter is read client-side so
  // the layout does not re-render (and refetch) when the filter changes.
  const seenKey = useRef<string | null>(null);
  const filterKey = `${includeArchived ? 1 : 0}|${folderId ?? ""}`;
  useEffect(() => {
    const previous = seenKey.current;
    seenKey.current = filterKey;
    const filters = parseInboxFilters({
      archived: includeArchived ? "1" : undefined,
      folder: folderId ?? undefined,
    });
    seeding.setInboxFilters(filters);
    if (previous === null && !filtered) {
      return;
    }
    let live = true;
    if (previous !== null) {
      seeding.seedInbox([], false);
      seeding.markInboxLoading();
    }
    void listConversationsAction(inboxFiltersToListArgs(filters)).then((result) => {
      if (!live) {
        return;
      }
      if (result.ok) {
        seeding.seedInbox(result.value.items, result.value.hasMore);
      } else {
        seeding.failInbox();
      }
    });
    return () => {
      live = false;
    };
  }, [filterKey, filtered, includeArchived, folderId, seeding]);
  useEffect(
    () => () => seeding.setInboxFilters({ includeArchived: false, folderId: null }),
    [seeding],
  );

  const detail = activeId ? state.detailsByConversation[activeId] : undefined;
  const failed = activeId ? state.threadFailed[activeId] === true : false;
  const showThread = Boolean(activeId && detail && !failed);
  const drawerOpen = showThread && searchParams.get("info") === "1";

  return (
    <PaneLayout
      view={drawerOpen ? "drawer" : activeId ? "main" : "list"}
      sidebar={<ChatsSidebar viewer={viewer} activeConversationId={activeId} />}
      sidebarLabel={t("listLabel")}
      drawer={
        drawerOpen && activeId && detail ? (
          <ConversationDrawer conversationId={activeId} detail={detail} />
        ) : undefined
      }
      drawerLabel={detail?.type === "group" ? t("groupInfo") : t("contactInfo")}
    >
      <InboxSeed inbox={inbox} enabled={!filtered} />
      {showThread && activeId && detail ? (
        <ThreadPanel
          key={activeId}
          conversationId={activeId}
          detail={detail}
          currentUserId={userId}
        />
      ) : !activeId ? (
        <ChatsWelcome />
      ) : null}
      <div style={{ display: showThread ? "none" : "contents" }}>
        {children}
      </div>
    </PaneLayout>
  );
}

