"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { memo, useCallback } from "react";
import { useTranslations } from "next-intl";

import { useDiscovery } from "../context/DiscoveryContext";
import styles from "../discovery-contacts.module.css";
import { UserAvatar } from "./UserAvatar";

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
    <section className={styles.section} aria-labelledby="discovery-recents-heading">
      <h2 id="discovery-recents-heading" className={styles.sectionTitle}>
        {t("recents.title")}
      </h2>
      <ul className={styles.list}>
        {state.recents.map((item) => (
          <li key={item.id} className={styles.card}>
            <Link
              href={`/app/profile/${item.username}`}
              className={styles.cardLink}
            >
              <UserAvatar avatarUrl={item.avatarUrl} />
              <div className={styles.cardText}>
                <p className={styles.displayName}>
                  {item.displayName ?? item.username}
                </p>
                <p className={styles.username}>@{item.username}</p>
              </div>
            </Link>
            <button
              type="button"
              className={styles.iconButton}
              onClick={onClearOne(item.id)}
              aria-label={t("recents.removeOne", { username: item.username })}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={styles.textButton}
        onClick={() => void clearAllRecents()}
      >
        {t("recents.clearAll")}
      </button>
    </section>
  );
}

export const RecentSearches = memo(RecentSearchesInner);
