"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { memo, useCallback } from "react";
import { useTranslations } from "next-intl";

import { Avatar } from "@/shell/components/Avatar";
import ui from "@/shell/styles/ui.module.css";

import { useDiscovery } from "../context/DiscoveryContext";
import styles from "../discovery-contacts.module.css";

function RecentSearchesInner() {
  const t = useTranslations("discovery-contacts");
  const { state, clearRecent, clearAllRecents } = useDiscovery();

  const onClearOne = useCallback(
    (id: string) => () => {
      void clearRecent(id);
    },
    [clearRecent],
  );

  if (state.recents.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="discovery-recents-heading">
      <div className={styles.sectionHead}>
        <h2
          id="discovery-recents-heading"
          className={`${ui.sectionLabel} ${ui.sectionLabelMuted}`}
        >
          {t("recents.title")}
        </h2>
        <button
          type="button"
          className={ui.linkBtn}
          onClick={() => void clearAllRecents()}
        >
          {t("recents.clearAll")}
        </button>
      </div>
      <ul className={ui.list}>
        {state.recents.map((item) => {
          const name = item.displayName ?? item.username;
          return (
            <li key={item.id} className={styles.recentRow}>
              <Link href={`/app/profile/${item.username}`} className={ui.memberRow}>
                <Avatar name={name} seed={item.username} src={item.avatarUrl} size="md" />
                <span className={ui.memberRowBody}>
                  <span className={`${ui.memberRowName} bidi-auto`}>{name}</span>
                  <span className={`${ui.memberRowAbout} handle`}>@{item.username}</span>
                </span>
              </Link>
              <button
                type="button"
                className={`${ui.iconBtn} ${ui.iconBtnSm}`}
                onClick={onClearOne(item.id)}
                aria-label={t("recents.removeOne", { username: item.username })}
                title={t("recents.removeOne", { username: item.username })}
              >
                <X size={16} aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export const RecentSearches = memo(RecentSearchesInner);
