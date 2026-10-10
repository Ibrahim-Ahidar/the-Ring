"use client";

import Link from "next/link";
import { LogOut, MessageCircle } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { Avatar } from "@/shell/components/Avatar";
import ui from "@/shell/styles/ui.module.css";

import {
  createInviteLinkAction,
  inviteMemberAction,
  joinByCodeAction,
  leaveGroupAction,
  listMembersAction,
  removeMemberAction,
  setMessagingRestrictedAction,
  setRoleAction,
  transferOwnershipAction,
  updateGroupAction,
} from "../actions";
import { groupsErrorMessage } from "../error-message";
import type { GroupMember, GroupSummary } from "../types";
import { ConfirmDialog } from "./ConfirmDialog";
import { GroupReportsSection } from "./GroupReportsSection";
import styles from "../groups.module.css";

type Props = {
  group: GroupSummary;
  currentUserId: string;
};

type ConfirmState =
  | { kind: "remove"; userId: string }
  | { kind: "leave" }
  | null;

const SM_BTN = `${ui.btn} ${ui.btnSm} ${ui.btnSecondary}`;

function GroupAdminClientInner({ group, currentUserId }: Props) {
  const t = useTranslations("groups");
  const router = useRouter();
  const [name, setName] = useState(group.title ?? "");
  const [description, setDescription] = useState(group.description ?? "");
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [inviteUsername, setInviteUsername] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [latestLink, setLatestLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const canAdmin = group.myRole === "owner" || group.myRole === "admin";
  const isOwner = group.myRole === "owner";
  const title = group.title ?? "";

  const loadMembers = useCallback(async () => {
    const result = await listMembersAction(group.id);
    if (result.ok) {
      setMembers(result.value);
    }
  }, [group.id]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const transferTargets = useMemo(
    () => members.filter((m) => m.userId !== currentUserId && m.role !== "owner"),
    [members, currentUserId],
  );

  async function saveProfile() {
    setError(null);
    const result = await updateGroupAction({
      conversationId: group.id,
      name,
      description,
    });
    if (!result.ok) {
      setError(groupsErrorMessage(t, result.error.code));
    }
  }

  async function onInvite(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const result = await inviteMemberAction({
      conversationId: group.id,
      username: inviteUsername,
    });
    if (!result.ok) {
      setError(groupsErrorMessage(t, result.error.code));
      return;
    }
    setInviteUsername("");
    await loadMembers();
  }

  async function onCreateLink() {
    setError(null);
    const result = await createInviteLinkAction({ conversationId: group.id });
    if (!result.ok) {
      setError(groupsErrorMessage(t, result.error.code));
      return;
    }
    setLatestLink(result.value.code);
  }

  async function onJoinByCode(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const result = await joinByCodeAction(joinCode);
    if (!result.ok) {
      setError(groupsErrorMessage(t, result.error.code));
      return;
    }
    router.push(`/app/chats/${result.value.conversationId}`);
  }

  async function runConfirmed() {
    if (!confirm) {
      return;
    }
    setError(null);
    if (confirm.kind === "remove") {
      const result = await removeMemberAction({
        conversationId: group.id,
        userId: confirm.userId,
      });
      if (!result.ok) {
        setError(groupsErrorMessage(t, result.error.code));
      } else {
        await loadMembers();
      }
    }
    if (confirm.kind === "leave") {
      const result = await leaveGroupAction(group.id);
      if (!result.ok) {
        setError(groupsErrorMessage(t, result.error.code));
      } else {
        router.push("/app/groups");
      }
    }
    setConfirm(null);
  }

  return (
    <>
      <div className={ui.profileHero}>
        <Avatar name={title} seed={group.id} src={group.avatarUrl} size="xl" />
        <h2 className={`${ui.profileHeroName} bidi-auto`}>{title}</h2>
        {group.description ? (
          <p className={`${ui.profileHeroHandle} bidi-auto`}>{group.description}</p>
        ) : null}
        <div className={ui.profileActions}>
          <Link className={`${ui.btn} ${ui.btnSecondary}`} href={`/app/chats/${group.id}`}>
            <MessageCircle size={18} aria-hidden />
            {t("openChat")}
          </Link>
        </div>
      </div>

      {error ? (
        <p className={`${ui.errorText} ${styles.errorBox}`} role="alert">
          {error}
        </p>
      ) : null}

      {canAdmin ? (
        <section className={ui.settingsCard}>
          <div className={ui.settingsCardBody}>
            <div className={ui.field}>
              <label className={ui.fieldLabel} htmlFor="admin-group-name">
                {t("nameLabel")}
              </label>
              <input
                id="admin-group-name"
                className={ui.input}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
              />
            </div>
            <div className={ui.field}>
              <label className={ui.fieldLabel} htmlFor="admin-group-description">
                {t("descriptionLabel")}
              </label>
              <textarea
                id="admin-group-description"
                className={ui.input}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={300}
              />
            </div>
            <div className={ui.dialogActions}>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnPrimary}`}
                onClick={() => void saveProfile()}
              >
                {t("actions.save")}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {canAdmin ? (
        <section className={ui.settingsCard}>
          <div className={ui.settingsCardBody}>
            <form className={styles.inlineForm} onSubmit={(event) => void onInvite(event)}>
              <div className={ui.field}>
                <label className={ui.fieldLabel} htmlFor="invite-username">
                  {t("inviteLabel")}
                </label>
                <div className={ui.inputPrefix}>
                  <span aria-hidden>@</span>
                  <input
                    id="invite-username"
                    value={inviteUsername}
                    onChange={(event) => setInviteUsername(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              </div>
              <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`}>
                {t("inviteSubmit")}
              </button>
            </form>
            <div className={styles.linkRow}>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnSecondary}`}
                onClick={() => void onCreateLink()}
              >
                {t("createLinkSubmit")}
              </button>
              {latestLink ? (
                <span className={styles.linkResult}>
                  {t("linkCreated")}: <code className="handle">{latestLink}</code>
                </span>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <section className={ui.settingsCard}>
        <div className={ui.settingsCardBody}>
          <form className={styles.inlineForm} onSubmit={(event) => void onJoinByCode(event)}>
            <div className={ui.field}>
              <label className={ui.fieldLabel} htmlFor="join-code">
                {t("joinCodeLabel")}
              </label>
              <input
                id="join-code"
                className={ui.input}
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <button type="submit" className={`${ui.btn} ${ui.btnSecondary}`}>
              {t("joinSubmit")}
            </button>
          </form>
        </div>
      </section>

      <section className={ui.settingsCard} aria-labelledby="members-admin-title">
        <div className={ui.settingsCardHead}>
          <h2 id="members-admin-title" className={ui.settingsCardTitle}>
            {t("membersTab")}
            {members.length > 0 ? (
              <span className={styles.count}> · {members.length}</span>
            ) : null}
          </h2>
        </div>
        <ul className={styles.memberList}>
          {members.map((member) => {
            const memberName = member.displayName ?? member.username;
            const manageable =
              canAdmin && member.role !== "owner" && member.userId !== currentUserId;
            const transferable =
              isOwner && member.userId !== currentUserId && member.role !== "owner";
            return (
              <li key={member.userId} className={styles.memberItem}>
                <div className={ui.memberRow}>
                  <Avatar
                    name={memberName}
                    seed={member.userId}
                    src={member.avatarUrl}
                    size="md"
                  />
                  <span className={ui.memberRowBody}>
                    <span className={`${ui.memberRowName} bidi-auto`}>{memberName}</span>
                    <span className={`${ui.memberRowAbout} handle`}>@{member.username}</span>
                  </span>
                  <span className={member.role === "member" ? `${ui.tag} ${ui.tagNeutral}` : ui.tag}>
                    {t(`roles.${member.role}`)}
                  </span>
                </div>
                {manageable || transferable ? (
                  <div className={styles.memberActions}>
                    {manageable ? (
                      <>
                        {member.role === "member" ? (
                          <button
                            type="button"
                            className={SM_BTN}
                            aria-label={t("promoteAdmin")}
                            onClick={() =>
                              void setRoleAction({
                                conversationId: group.id,
                                userId: member.userId,
                                role: "admin",
                              }).then(() => loadMembers())
                            }
                          >
                            {t("promoteAdmin")}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={SM_BTN}
                            aria-label={t("demoteMember")}
                            onClick={() =>
                              void setRoleAction({
                                conversationId: group.id,
                                userId: member.userId,
                                role: "member",
                              }).then(() => loadMembers())
                            }
                          >
                            {t("demoteMember")}
                          </button>
                        )}
                        <button
                          type="button"
                          className={SM_BTN}
                          aria-label={
                            member.messagingRestricted
                              ? t("allowMessaging")
                              : t("restrictMessaging")
                          }
                          onClick={() =>
                            void setMessagingRestrictedAction({
                              conversationId: group.id,
                              userId: member.userId,
                              restricted: !member.messagingRestricted,
                            }).then(() => loadMembers())
                          }
                        >
                          {member.messagingRestricted
                            ? t("allowMessaging")
                            : t("restrictMessaging")}
                        </button>
                        <button
                          type="button"
                          className={`${ui.btn} ${ui.btnSm} ${ui.btnDanger}`}
                          aria-label={t("removeMember")}
                          onClick={() => setConfirm({ kind: "remove", userId: member.userId })}
                        >
                          {t("removeMember")}
                        </button>
                      </>
                    ) : null}
                    {transferable ? (
                      <button
                        type="button"
                        className={SM_BTN}
                        aria-label={t("transferOwnership")}
                        onClick={() =>
                          void transferOwnershipAction({
                            conversationId: group.id,
                            userId: member.userId,
                          }).then(() => router.refresh())
                        }
                      >
                        {t("transferOwnership")}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      <GroupReportsSection conversationId={group.id} canModerate={canAdmin} />

      {group.myRole !== "owner" ? (
        <section className={ui.settingsCard}>
          <button
            type="button"
            className={`${ui.setting} ${styles.danger}`}
            aria-label={t("leaveGroup")}
            onClick={() => setConfirm({ kind: "leave" })}
          >
            <LogOut size={20} className="flip-rtl" aria-hidden />
            <span className={ui.settingBody}>{t("leaveGroup")}</span>
          </button>
        </section>
      ) : null}

      {isOwner && transferTargets.length > 0 ? (
        <p className={styles.note}>{t("errors.groups.owner_must_transfer")}</p>
      ) : null}

      {confirm?.kind === "remove" ? (
        <ConfirmDialog
          title={t("confirm.removeTitle")}
          body={t("confirm.removeBody")}
          confirmLabel={t("confirm.confirm")}
          cancelLabel={t("confirm.cancel")}
          destructive
          onCancel={() => setConfirm(null)}
          onConfirm={() => void runConfirmed()}
        />
      ) : null}

      {confirm?.kind === "leave" ? (
        <ConfirmDialog
          title={t("confirm.leaveTitle")}
          body={t("confirm.leaveBody")}
          confirmLabel={t("confirm.confirm")}
          cancelLabel={t("confirm.cancel")}
          destructive
          onCancel={() => setConfirm(null)}
          onConfirm={() => void runConfirmed()}
        />
      ) : null}
    </>
  );
}

export const GroupAdminClient = memo(GroupAdminClientInner);
