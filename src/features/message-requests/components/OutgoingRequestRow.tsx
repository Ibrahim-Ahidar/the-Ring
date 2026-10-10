"use client";

import Link from "next/link";
import { memo } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { Avatar } from "@/shell/components/Avatar";
import ui from "@/shell/styles/ui.module.css";

import type { OutgoingMessageRequest } from "../types";
import styles from "../message-requests.module.css";

type Props = {
  item: OutgoingMessageRequest;
};

function displayName(item: OutgoingMessageRequest): string {
  return item.displayName?.trim() || item.username;
}

function OutgoingRequestRowInner({ item }: Props) {
  const t = useTranslations("message-requests");
  const format = useFormatter();
  const name = displayName(item);

  return (
    <li className={styles.row}>
      <Avatar name={name} seed={item.username} size="md" />
      <div className={styles.rowBody}>
        <div className={styles.rowTop}>
          <span className={`${styles.rowName} bidi-auto`}>{name}</span>
          <time className={styles.rowTime} dateTime={item.createdAt}>
            {format.dateTime(new Date(item.createdAt), {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </time>
        </div>
        <span className={`${styles.rowHandle} handle`}>@{item.username}</span>
        {item.note ? <p className={`${styles.note} bidi-auto`}>{item.note}</p> : null}
        <div className={styles.actions}>
          <span
            className={item.status === "accepted" ? ui.tag : `${ui.tag} ${ui.tagNeutral}`}
          >
            {t(`status.${item.status}`)}
          </span>
          {item.status === "accepted" && item.conversationId ? (
            <Link
              href={`/app/chats/${item.conversationId}`}
              className={`${ui.btn} ${ui.btnSm} ${ui.btnPrimary}`}
            >
              {t("openChat")}
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export const OutgoingRequestRow = memo(OutgoingRequestRowInner);
