"use client";

import { Star } from "lucide-react";
import Link from "next/link";
import { memo } from "react";
import { useTranslations } from "next-intl";

import { Avatar } from "@/shell/components/Avatar";
import ui from "@/shell/styles/ui.module.css";

import { useDiscovery } from "../context/DiscoveryContext";
import styles from "../discovery-contacts.module.css";

function FavoritesListInner() {
  const t = useTranslations("discovery-contacts");
  const { state } = useDiscovery();

  return (
    <section aria-labelledby="discovery-favorites-heading">
      <h2 id="discovery-favorites-heading" className={ui.sectionLabel}>
        {t("favorites.title")}
      </h2>
      {state.favoritesLoading ? (
        <p className={ui.emptyInline} role="status">
          {t("favorites.loading")}
        </p>
      ) : state.favorites.length === 0 ? (
        <p className={ui.emptyInline}>{t("favorites.empty")}</p>
      ) : (
        <ul className={ui.list}>
          {state.favorites.map((item) => {
            const name = item.displayName ?? item.username;
            return (
              <li key={item.favoriteUserId}>
                <Link href={`/app/profile/${item.username}`} className={ui.memberRow}>
                  <Avatar
                    name={name}
                    seed={item.favoriteUserId}
                    src={item.avatarUrl}
                    size="md"
                  />
                  <span className={ui.memberRowBody}>
                    <span className={`${ui.memberRowName} bidi-auto`}>{name}</span>
                    <span className={`${ui.memberRowAbout} handle`}>@{item.username}</span>
                  </span>
                  <Star size={16} className={styles.star} fill="currentColor" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export const FavoritesList = memo(FavoritesListInner);
