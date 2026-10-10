"use client";

import { useSearchParams } from "next/navigation";
import { memo } from "react";
import { useTranslations } from "next-intl";

import { PaneLayout } from "@/shell/components/PaneLayout";

import { useMessaging } from "../context/MessagingProvider";
import type { ChatsViewer, ConversationDetail } from "../types";
import { ChatsSidebar } from "./ChatsSidebar";
import { ChatsWelcome } from "./ChatsWelcome";
import { ConversationDrawer } from "./ConversationDrawer";
import { ThreadPanel } from "./ThreadPanel";

type Props = {
  userId: string;
  viewer: ChatsViewer | null;
  activeConversationId?: string;
  threadDetail?: ConversationDetail;
};

function ChatsLayoutInner({ userId, viewer, activeConversationId, threadDetail }: Props) {
  const t = useTranslations("direct-messaging");
  const searchParams = useSearchParams();
  const { state } = useMessaging();
  const liveDetail =
    activeConversationId && threadDetail
      ? (state.detailsByConversation[activeConversationId] ?? threadDetail)
      : undefined;
  const showThread = Boolean(activeConversationId && liveDetail);
  const drawerOpen = showThread && searchParams.get("info") === "1";

  return (
    <PaneLayout
      view={drawerOpen ? "drawer" : showThread ? "main" : "list"}
      sidebar={<ChatsSidebar viewer={viewer} activeConversationId={activeConversationId} />}
      sidebarLabel={t("listLabel")}
      drawer={
        drawerOpen && activeConversationId && liveDetail ? (
          <ConversationDrawer conversationId={activeConversationId} detail={liveDetail} />
        ) : undefined
      }
      drawerLabel={
        liveDetail?.type === "group" ? t("groupInfo") : t("contactInfo")
      }
    >
      {activeConversationId && liveDetail ? (
        <ThreadPanel
          conversationId={activeConversationId}
          detail={liveDetail}
          currentUserId={userId}
        />
      ) : (
        <ChatsWelcome />
      )}
    </PaneLayout>
  );
}

export const ChatsLayout = memo(ChatsLayoutInner);
