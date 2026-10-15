"use client";

import Link from "next/link";
import { MessageSquarePlus } from "lucide-react";
import { memo, Suspense } from "react";
import { useTranslations } from "next-intl";

import { Avatar } from "@/shell/components/Avatar";
import { PaneHeader } from "@/shell/components/PaneHeader";
import ui from "@/shell/styles/ui.module.css";

import type { ChatsViewer } from "../types";
import { ConversationList } from "./ConversationList";
import styles from "../direct-messaging.module.css";

type Props = {
  viewer: ChatsViewer | null;
  activeConversationId?: string;
};

function ChatsSidebarInner({ viewer, activeConversationId }: Props) {
  const t = useTranslations("direct-messaging");

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
          <Link
            href="/app/chats/new"
            className={ui.iconBtn}
            aria-label={t("newChat")}
            title={t("newChat")}
          >
            <MessageSquarePlus size={24} aria-hidden />
          </Link>
        }
      />
      <div className="pane-tools">
        <div id="conversation-folders" className={styles.foldersHost} />
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
