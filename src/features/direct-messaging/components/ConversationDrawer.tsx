"use client";

import Link from "next/link";
import { ChevronRight, Settings2, SlidersHorizontal, UserRound, X } from "lucide-react";
import { memo, useMemo } from "react";
import { useTranslations } from "next-intl";

import { Avatar } from "@/shell/components/Avatar";
import { getContributions } from "@/shell/slots";
import ui from "@/shell/styles/ui.module.css";

import { useQueryHref } from "../hooks/useQueryHref";
import { conversationTitle } from "../lib/titles";
import type { ConversationDetail } from "../types";
import styles from "../direct-messaging.module.css";

type Props = {
  conversationId: string;
  detail: ConversationDetail;
};

/** Contact / group info opened from the conversation header (`?info=1`). */
function ConversationDrawerInner({ conversationId, detail }: Props) {
  const t = useTranslations("direct-messaging");
  const tFeature = useTranslations();
  const queryHref = useQueryHref();
  const tabs = useMemo(() => getContributions("rightPanelTab"), []);
  const menus = useMemo(() => getContributions("listItemMenu"), []);

  const isGroup = detail.type === "group";
  const title = conversationTitle(detail, t);
  const heading = isGroup ? t("groupInfo") : t("contactInfo");
  const closeHref = queryHref(`/app/chats/${conversationId}`, { info: null });
  const menuCtx = useMemo(
    () => ({
      conversationId,
      conversationType: detail.type,
      membership: {
        pinned_at: detail.pinned_at,
        muted_until: detail.muted_until,
        archived_at: detail.archived_at,
      },
    }),
    [conversationId, detail.archived_at, detail.muted_until, detail.pinned_at, detail.type],
  );
  const availableMenus = menus.filter((menu) => menu.isAvailable(menuCtx));

  return (
    <>
      <header className={styles.drawerHeader}>
        <Link href={closeHref} className={ui.iconBtn} aria-label={t("closeInfo")} title={t("closeInfo")}>
          <X size={24} aria-hidden />
        </Link>
        <h2 className={styles.drawerTitle}>{heading}</h2>
      </header>
      <div className={styles.drawerBody}>
        <div className={ui.profileHero}>
          <Avatar
            name={title}
            seed={detail.other_user_id ?? conversationId}
            src={detail.other_avatar_url}
            size="xl"
          />
          <h3 className={ui.profileHeroName}>{title}</h3>
          {isGroup ? (
            <p className={ui.profileHeroHandle}>{t("groupLabel")}</p>
          ) : detail.other_username ? (
            <p className={`${ui.profileHeroHandle} handle`}>@{detail.other_username}</p>
          ) : null}
        </div>

        {tabs.map((tab) => (
          <section
            key={tab.id}
            className={styles.infoSection}
            aria-label={tFeature(tab.labelKey!)}
          >
            <tab.Component conversationId={conversationId} />
          </section>
        ))}

        <section className={styles.infoSection}>
          {availableMenus.map((menu) => {
            const label = tFeature(menu.labelKey!);
            return (
              <button
                key={menu.id}
                type="button"
                className={ui.listRow}
                onClick={() => void menu.run(menuCtx)}
              >
                <SlidersHorizontal size={24} aria-hidden />
                <span className={ui.listRowBody}>
                  <span className={ui.listRowTitle}>{label}</span>
                </span>
              </button>
            );
          })}
          {isGroup ? (
            <Link className={ui.listRow} href={`/app/groups/${conversationId}`}>
              <Settings2 size={24} aria-hidden />
              <span className={ui.listRowBody}>
                <span className={ui.listRowTitle}>{t("manageGroup")}</span>
              </span>
              <span className={ui.listRowTrail}>
                <ChevronRight size={16} className="flip-rtl" aria-hidden />
              </span>
            </Link>
          ) : detail.other_username ? (
            <Link
              className={ui.listRow}
              href={`/app/profile/${encodeURIComponent(detail.other_username)}`}
            >
              <UserRound size={24} aria-hidden />
              <span className={ui.listRowBody}>
                <span className={ui.listRowTitle}>{t("viewProfile")}</span>
              </span>
              <span className={ui.listRowTrail}>
                <ChevronRight size={16} className="flip-rtl" aria-hidden />
              </span>
            </Link>
          ) : null}
        </section>
      </div>
    </>
  );
}

export const ConversationDrawer = memo(ConversationDrawerInner);
