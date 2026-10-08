"use client";

import { Star } from "lucide-react";
import Link from "next/link";
import { memo } from "react";
import { useTranslations } from "next-intl";

import { useDiscovery } from "../context/DiscoveryContext";
import styles from "../discovery-contacts.module.css";
import { UserAvatar } from "./UserAvatar";

function FavoritesListInner() {
  const t = useTranslations("discovery-contacts");
  const { state } = useDiscovery();

  if (state.favoritesLoading) {
    return (
      <section className={styles.section} aria-labelledby="discovery-favorites-heading">
        <h2 id="discovery-favorites-heading" className={styles.sectionTitle}>
          {t("favorites.title")}
        </h2>
        <p className={styles.hint}>{t("favorites.loading")}</p>
      </section>
    );
  }

  if (state.favorites.length === 0) {
    return (
      <section className={styles.section} aria-labelledby="discovery-favorites-heading">
        <h2 id="discovery-favorites-heading" className={styles.sectionTitle}>
          {t("favorites.title")}
        </h2>
        <p className={styles.empty}>{t("favorites.empty")}</p>
      </section>
    );
  }

  return (
    <section className={styles.section} aria-labelledby="discovery-favorites-heading">
      <h2 id="discovery-favorites-heading" className={styles.sectionTitle}>
        {t("favorites.title")}
      </h2>
      <ul className={styles.list}>
        {state.favorites.map((item) => (
          <li key={item.favoriteUserId} className={styles.card}>
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
            <Star
              size={18}
              aria-hidden="true"
              fill="currentColor"
              className={styles.iconButton}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

export const FavoritesList = memo(FavoritesListInner);
