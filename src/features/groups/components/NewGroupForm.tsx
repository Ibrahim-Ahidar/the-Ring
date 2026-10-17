"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

import { createGroupAction, uploadGroupAvatarAction } from "../actions";
import { groupsErrorMessage } from "../error-message";
import { parseMemberUsernames } from "../lib/member-usernames";

function NewGroupFormInner() {
  const t = useTranslations("groups");
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [members, setMembers] = useState("");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  /** Set when the group exists but some members could not be added. */
  const [createdId, setCreatedId] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (createdId) {
      router.push(`/app/chats/${createdId}`);
      return;
    }
    setPending(true);
    setError(null);

    const created = await createGroupAction({
      name,
      description: description || null,
      members: parseMemberUsernames(members),
    });
    if (!created.ok) {
      setPending(false);
      setError(groupsErrorMessage(t, created.error.code));
      return;
    }

    if (avatar) {
      const formData = new FormData();
      formData.set("avatar", avatar);
      const uploaded = await uploadGroupAvatarAction(
        created.value.conversationId,
        formData,
      );
      if (!uploaded.ok) {
        setPending(false);
        setError(groupsErrorMessage(t, uploaded.error.code));
        return;
      }
    }

    setPending(false);
    const { conversationId, failedInvites } = created.value;
    if (failedInvites.length > 0) {
      // The group exists; resubmitting would create a second one.
      setCreatedId(conversationId);
      setError(
        t("invitesFailed", {
          list: failedInvites
            .map((f) => `@${f.username} (${groupsErrorMessage(t, f.code)})`)
            .join(", "),
        }),
      );
      return;
    }
    router.push(`/app/chats/${conversationId}`);
  }

  return (
    <form className={ui.settingsCard} onSubmit={(event) => void onSubmit(event)}>
      <div className={ui.settingsCardBody}>
        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor="group-name">
            {t("nameLabel")}
          </label>
          <input
            id="group-name"
            className={ui.input}
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={80}
            autoComplete="off"
          />
        </div>

        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor="group-description">
            {t("descriptionLabel")}
          </label>
          <textarea
            id="group-description"
            className={ui.input}
            name="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={300}
          />
        </div>

        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor="group-members">
            {t("membersLabel")}
          </label>
          <input
            id="group-members"
            className={ui.input}
            name="members"
            value={members}
            onChange={(event) => setMembers(event.target.value)}
            placeholder={t("membersPlaceholder")}
            aria-describedby="group-members-hint"
            autoComplete="off"
            spellCheck={false}
            disabled={createdId !== null}
          />
          <p id="group-members-hint" className={ui.fieldHint}>
            {t("membersHint")}
          </p>
        </div>

        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor="group-avatar">
            {t("avatarLabel")}
          </label>
          <input
            id="group-avatar"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(event) => setAvatar(event.target.files?.[0] ?? null)}
          />
        </div>

        {error ? (
          <p className={ui.errorText} role="alert">
            {error}
          </p>
        ) : null}

        <div className={ui.dialogActions}>
          <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`} disabled={pending}>
            {pending
              ? t("states.saving")
              : createdId
                ? t("openGroup")
                : t("createSubmit")}
          </button>
        </div>
      </div>
    </form>
  );
}

export const NewGroupForm = NewGroupFormInner;
