"use client";

import { MessageCircle, Star, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { Avatar } from "@/shell/components/Avatar";
import ui from "@/shell/styles/ui.module.css";

import { favoriteAction, unfavoriteAction } from "../actions";
import type { ProfileView as ProfileViewType } from "../types";
import styles from "../discovery-contacts.module.css";

type ProfileViewProps = {
  profile: ProfileViewType;
  signedIn: boolean;
  newChatHref: string;
  /** Extra actions owned by other features (block, report). */
  footer?: ReactNode;
};

function ProfileViewInner({ profile, signedIn, newChatHref, footer }: ProfileViewProps) {
  const t = useTranslations("discovery-contacts");
  const format = useFormatter();
  const [favorited, setFavorited] = useState(profile.isFavorited ?? false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const name = profile.displayName ?? profile.username;

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
        time: format.dateTime(new Date(profile.lastSeenAt), {
          dateStyle: "medium",
          timeStyle: "short",
        }),
      });
    }
    return t("profile.offline");
  })();

  return (
    <>
      <header className={ui.profileHero}>
        <Avatar name={name} seed={profile.id} src={profile.avatarUrl} size="xl" />
        <h2 className={`${ui.profileHeroName} bidi-auto`}>{name}</h2>
        <p className={`${ui.profileHeroHandle} handle`}>@{profile.username}</p>
        {presenceLine ? (
          <p className={styles.presence} data-online={profile.isOnline ? "true" : "false"}>
            {presenceLine}
          </p>
        ) : null}
        {profile.bio ? <p className={`${styles.bio} bidi-auto`}>{profile.bio}</p> : null}
        {signedIn ? (
          <div className={ui.profileActions}>
            <Link href={newChatHref} className={`${ui.btn} ${ui.btnPrimary}`}>
              <MessageCircle size={18} aria-hidden />
              {t("profile.startConversation")}
            </Link>
            <button
              type="button"
              className={`${ui.btn} ${ui.btnSecondary}`}
              onClick={() => void onToggleFavorite()}
              disabled={favoriteBusy}
              aria-pressed={favorited}
              aria-label={
                favorited
                  ? t("profile.unfavorite", { username: profile.username })
                  : t("profile.favorite", { username: profile.username })
              }
            >
              <Star size={18} aria-hidden fill={favorited ? "currentColor" : "none"} />
              {favorited ? t("profile.unfavoriteShort") : t("profile.favoriteShort")}
            </button>
          </div>
        ) : null}
      </header>

      {signedIn && profile.sharedGroups !== undefined ? (
        <section className={ui.settingsCard} aria-labelledby="shared-groups-heading">
          <div className={ui.settingsCardHead}>
            <h2 id="shared-groups-heading" className={ui.settingsCardTitle}>
              {t("profile.sharedGroups")}
            </h2>
          </div>
          {profile.sharedGroups.length === 0 ? (
            <p className={styles.cardNote}>{t("profile.noSharedGroups")}</p>
          ) : (
            <ul className={styles.groupList}>
              {profile.sharedGroups.map((group) => (
                <li key={group.id} className={ui.setting}>
                  <Users size={20} aria-hidden />
                  <span className={`${ui.settingBody} bidi-auto`}>
                    {group.title ?? t("profile.untitledGroup")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {footer}
    </>
  );
}

export const ProfileView = ProfileViewInner;
