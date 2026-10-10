"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { useMessaging } from "@/features/direct-messaging/context/MessagingProvider";
import { Avatar } from "@/shell/components/Avatar";
import ui from "@/shell/styles/ui.module.css";

import { listMembersAction } from "../actions";
import type { GroupMember } from "../types";
import styles from "../groups.module.css";

type Props = {
  conversationId: string;
};

function MembersPanelTabInner({ conversationId }: Props) {
  const t = useTranslations("groups");
  const { state } = useMessaging();
  const detail =
    state.detailsByConversation[conversationId] ??
    state.conversations.find((c) => c.id === conversationId);
  const isGroup = detail?.type === "group";

  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const result = await listMembersAction(conversationId);
    setLoading(false);
    if (!result.ok) {
      setError(true);
      return;
    }
    setMembers(result.value);
  }, [conversationId]);

  useEffect(() => {
    if (isGroup) {
      void load();
    }
  }, [isGroup, load]);

  if (!isGroup) {
    return null;
  }

  return (
    <div>
      <h4 className={styles.panelHead}>
        <span>{t("membersTab")}</span>
        {members.length > 0 ? <span>{members.length}</span> : null}
      </h4>
      {error ? (
        <p className={`${ui.errorText} ${styles.panelNote}`} role="alert">
          {t("errors.generic")}{" "}
          <button type="button" className={ui.linkBtn} onClick={() => void load()}>
            {t("actions.retry")}
          </button>
        </p>
      ) : null}
      {loading && members.length === 0 ? (
        <p className={styles.panelNote}>{t("states.loading")}</p>
      ) : null}
      {!error && members.length > 0 ? (
        <ul className={ui.list}>
          {members.map((member) => {
            const name = member.displayName ?? member.username;
            return (
              <li key={member.userId} className={ui.memberRow}>
                <Avatar name={name} seed={member.userId} src={member.avatarUrl} size="md" />
                <span className={ui.memberRowBody}>
                  <span className={`${ui.memberRowName} bidi-auto`}>{name}</span>
                  <span className={`${ui.memberRowAbout} handle`}>@{member.username}</span>
                </span>
                {member.role !== "member" ? (
                  <span className={ui.tag}>{t(`roles.${member.role}`)}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export const MembersPanelTab = memo(MembersPanelTabInner);
