"use client";

import Link from "next/link";
import { Inbox, MessageSquarePlus, UsersRound } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { memo, Suspense, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { Avatar } from "@/shell/components/Avatar";
import { PaneHeader } from "@/shell/components/PaneHeader";
import ui from "@/shell/styles/ui.module.css";

import type { ChatsViewer } from "../types";
import { ConversationList } from "./ConversationList";
import { InboxTypeFilter } from "./InboxTypeFilter";
import styles from "../direct-messaging.module.css";

type Props = {
  viewer: ChatsViewer | null;
  activeConversationId?: string;
};

/**
 * Slot for the conversation-organization folder strip. The strip is portaled
 * in from outside the tree, so it must wait until this host has hydrated:
 * adding children earlier makes the server HTML and client tree disagree.
 * The effect (post-hydration) marks the host ready and announces it.
 */
function FoldersHost() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.dataset.ready = "1";
    document.dispatchEvent(new Event("conversation-folders:ready"));
  }, []);
  return <div ref={ref} id="conversation-folders" className={styles.foldersHost} />;
}

function ChatsSidebarInner({ viewer, activeConversationId }: Props) {
  const t = useTranslations("direct-messaging");
  const tRequests = useTranslations("message-requests");
  const tGroups = useTranslations("groups");
  const groupsOnly = useSearchParams().get("filter") === "groups";

  const viewerName = viewer ? (viewer.displayName ?? viewer.username) : null;

  return (
    <>
      <PaneHeader
        title={t("title")}
        leading={
          <Link
            href="/app/settings"
            className="pane-header__profile"
            aria-label={t("profileAndSettings")}
            title={t("profileAndSettings")}
          >
            <Avatar
              name={viewerName}
              seed={viewer?.id ?? "viewer"}
              src={viewer?.avatarUrl}
              size="sm"
            />
          </Link>
        }
        actions={
          <>
            {groupsOnly ? (
              <Link
                href="/app/groups/new"
                className={ui.iconBtn}
                aria-label={tGroups("createLink")}
                title={tGroups("createLink")}
              >
                <UsersRound size={24} aria-hidden />
              </Link>
            ) : null}
            <Link
              href="/app/chats/requests"
              className={ui.iconBtn}
              aria-label={tRequests("openRequests")}
              title={tRequests("openRequests")}
            >
              <Inbox size={24} aria-hidden />
            </Link>
            <Link
              href="/app/chats/new"
              className={ui.iconBtn}
              aria-label={t("newChat")}
              title={t("newChat")}
            >
              <MessageSquarePlus size={24} aria-hidden />
            </Link>
          </>
        }
      />
      <div className="pane-tools">
        <InboxTypeFilter />
        <FoldersHost />
      </div>
      <div className="pane-body scroll">
        <Suspense fallback={null}>
          <ConversationList activeConversationId={activeConversationId} />
        </Suspense>
      </div>
    </>
  );
}

export const ChatsSidebar = memo(ChatsSidebarInner);
