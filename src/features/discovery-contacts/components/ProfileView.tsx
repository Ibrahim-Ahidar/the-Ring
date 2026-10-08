"use client";

import { MessageCircle, Star } from "lucide-react";
import Link from "next/link";
import { memo, useCallback, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { favoriteAction, unfavoriteAction } from "../actions";
import type { ProfileView as ProfileViewType } from "../types";
import styles from "../discovery-contacts.module.css";
import { UserAvatar } from "./UserAvatar";

type ProfileViewProps = {
  profile: ProfileViewType;
  signedIn: boolean;
  newChatHref: string;
};

function formatLastSeen(iso: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function ProfileViewInner({ profile, signedIn, newChatHref }: ProfileViewProps) {
  const t = useTranslations("discovery-contacts");
  const locale = useLocale();
  const [favorited, setFavorited] = useState(profile.isFavorited ?? false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);

  const onToggleFavorite = useCallback(async () => {
    if (!signedIn) {
      return;
    }
    setFavoriteBusy(true);
    try {
      if (favorited) {
        const result = await unfavoriteAction(profile.username);
        if (result.ok) {
          setFavorited(false);
        }
      } else {
        const result = await favoriteAction(profile.username);
        if (result.ok) {
          setFavorited(true);
        }
      }
    } finally {
      setFavoriteBusy(false);
    }
  }, [favorited, profile.username, signedIn]);

  const presenceLine = (() => {
    if (profile.isOnline === undefined) {
      return null;
    }
    if (profile.isOnline) {
      return t("profile.online");
    }
    if (profile.lastSeenAt) {
      return t("profile.lastSeen", {
        time: formatLastSeen(profile.lastSeenAt, locale),
      });
    }
    return t("profile.offline");
  })();

  return (
    <article className={styles.profilePage}>
      <header className={styles.profileHeader}>
        <UserAvatar avatarUrl={profile.avatarUrl} size="lg" />
        <div>
          <h1 className={styles.displayName}>
            {profile.displayName ?? profile.username}
          </h1>
          <p className={styles.username}>@{profile.username}</p>
        </div>
        {profile.bio ? <p className={styles.bio}>{profile.bio}</p> : null}
        {presenceLine ? (
          <p className={styles.presence}>{presenceLine}</p>
        ) : null}
      </header>

      {signedIn ? (
        <div className={styles.actions}>
          <Link href={newChatHref} className={styles.primaryLink}>
            <MessageCircle size={18} aria-hidden="true" />
            {t("profile.startConversation")}
          </Link>
          <button
            type="button"
            className={styles.searchButton}
            onClick={() => void onToggleFavorite()}
            disabled={favoriteBusy}
            aria-pressed={favorited}
            aria-label={
              favorited
                ? t("profile.unfavorite", { username: profile.username })
                : t("profile.favorite", { username: profile.username })
            }
          >
            <Star
              size={18}
              aria-hidden="true"
              fill={favorited ? "currentColor" : "none"}
            />
            {favorited ? t("profile.unfavoriteShort") : t("profile.favoriteShort")}
          </button>
        </div>
      ) : null}

      {signedIn && profile.sharedGroups !== undefined ? (
        <section className={styles.section} aria-labelledby="shared-groups-heading">
          <h2 id="shared-groups-heading" className={styles.sectionTitle}>
            {t("profile.sharedGroups")}
          </h2>
          {profile.sharedGroups.length === 0 ? (
            <p className={styles.empty}>{t("profile.noSharedGroups")}</p>
          ) : (
            <ul className={styles.groupList}>
              {profile.sharedGroups.map((group) => (
                <li key={group.id}>{group.title ?? t("profile.untitledGroup")}</li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </article>
  );
}

export const ProfileView = memo(ProfileViewInner);
