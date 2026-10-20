"use client";

import Link from "next/link";
import { Pin } from "lucide-react";
import { memo, useMemo } from "react";
import { useTranslations } from "next-intl";

import type { TimelineMessage } from "@/platform/timeline";

import { useMessaging } from "../context/MessagingProvider";
import { useQueryHref } from "../hooks/useQueryHref";
import styles from "../direct-messaging.module.css";

type Props = {
  conversationId: string;
};

function latestPinned(messages: TimelineMessage[]): TimelineMessage | null {
  let latest: TimelineMessage | null = null;
  for (const message of messages) {
    if (!message.pinned_at || message.deletion_scope === "everyone") {
      continue;
    }
    if (!latest || message.pinned_at > latest.pinned_at!) {
      latest = message;
    }
  }
  return latest;
}

/** Most recently pinned message among the loaded pages; clicking jumps to it. */
function PinnedBarInner({ conversationId }: Props) {
  const t = useTranslations("direct-messaging");
  const { state } = useMessaging();
  const queryHref = useQueryHref();
  const messages = state.messagesByConversation[conversationId];
  const pinned = useMemo(() => latestPinned(messages ?? []), [messages]);

  if (!pinned) {
    return null;
  }

  const preview =
    pinned.body?.trim() ||
    (pinned.type === "image"
      ? t("quotedPhoto")
      : pinned.type === "audio"
        ? t("quotedVoice")
        : pinned.type === "file"
          ? t("quotedFile")
          : "");

  return (
    <Link
      className={styles.pinnedBar}
      href={queryHref(`/app/chats/${conversationId}`, { message: pinned.id, info: null })}
    >
      <Pin size={16} aria-hidden />
      <span className={styles.pinnedBarBody}>
        <span className={styles.pinnedBarLabel}>{t("pinnedMessage")}</span>
        <span className={styles.pinnedBarText}>{preview}</span>
      </span>
    </Link>
  );
}

export const PinnedBar = memo(PinnedBarInner);
