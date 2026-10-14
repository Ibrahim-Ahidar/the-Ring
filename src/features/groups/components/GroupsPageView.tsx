"use client";

import Link from "next/link";
import { Settings2, Users } from "lucide-react";
import { useTranslations } from "next-intl";

import type { ConversationSummary } from "@/features/direct-messaging/types";
import { Avatar } from "@/shell/components/Avatar";
import ui from "@/shell/styles/ui.module.css";

import styles from "../groups.module.css";

type Props = {
  groups: ConversationSummary[];
};

function GroupsPageViewInner({ groups }: Props) {
  const t = useTranslations("groups");

  if (groups.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={ui.emptyStateArt}>
          <Users size={48} aria-hidden />
        </span>
        <p className={ui.emptyStateText}>{t("emptyGroups")}</p>
        <Link className={`${ui.btn} ${ui.btnPrimary}`} href="/app/groups/new">
          {t("createLink")}
        </Link>
      </div>
    );
  }

  return (
    <ul className={`${ui.settingsCard} ${styles.groupList}`}>
      {groups.map((group) => {
        const title = group.title ?? "";
        return (
          <li key={group.id} className={styles.groupRow}>
            <Link
              className={`${ui.memberRow} ${styles.groupLink}`}
              href={`/app/chats/${group.id}`}
              aria-label={`${t("openChat")}: ${title}`}
            >
              <Avatar name={title} seed={group.id} size="md" />
              <span className={ui.memberRowBody}>
                <span className={`${ui.memberRowName} bidi-auto`}>{title}</span>
              </span>
            </Link>
            <Link
              className={ui.iconBtn}
              href={`/app/groups/${group.id}`}
              aria-label={`${t("adminTitle")}: ${title}`}
              title={t("adminTitle")}
            >
              <Settings2 size={20} aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export const GroupsPageView = GroupsPageViewInner;
