"use client";

import { Camera } from "lucide-react";
import { memo, useState } from "react";
import { useTranslations } from "next-intl";

import { Avatar } from "@/shell/components/Avatar";
import ui from "@/shell/styles/ui.module.css";
import {
  changeUsernameAction,
  deleteAccountAction,
  exportDataAction,
  updateProfileAction,
  uploadAvatarAction,
} from "../actions";
import { IdentityFormProvider, useIdentityForm } from "../context/identity-form-context";
import styles from "../identity.module.css";
import type { OwnProfile } from "../types";
import { FormFeedback } from "./FormFeedback";

type AccountSettingsProps = {
  profile: OwnProfile;
};

function AccountSettingsInner({ profile }: AccountSettingsProps) {
  const t = useTranslations("identity");
  const { submitting, startSubmit, finishSubmit } = useIdentityForm();
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [timezone, setTimezone] = useState(profile.timezone);
  const [newUsername, setNewUsername] = useState(profile.username);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    startSubmit();
    const result = await updateProfileAction({ displayName, bio, timezone });
    finishSubmit(
      result.ok
        ? { successMessage: t("savedProfile") }
        : { errorCode: result.error.code },
    );
  }

  async function onUsernameChange(event: React.FormEvent) {
    event.preventDefault();
    startSubmit();
    const result = await changeUsernameAction(newUsername);
    finishSubmit(
      result.ok
        ? { successMessage: t("savedProfile") }
        : { errorCode: result.error.code },
    );
  }

  async function onAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    startSubmit();
    const formData = new FormData();
    formData.set("avatar", file);
    const result = await uploadAvatarAction(formData);
    finishSubmit(
      result.ok
        ? { successMessage: t("savedProfile") }
        : { errorCode: result.error.code },
    );
    event.target.value = "";
  }

  async function onExport() {
    startSubmit();
    const result = await exportDataAction();
    finishSubmit(
      result.ok
        ? { successMessage: t("exportUnavailable") }
        : { errorCode: result.error.code },
    );
  }

  async function onDelete(event: React.FormEvent) {
    event.preventDefault();
    startSubmit();
    const result = await deleteAccountAction(deleteConfirm);
    if (!result.ok) {
      finishSubmit({ errorCode: result.error.code });
    }
  }

  return (
    <>
      <section className={ui.settingsCard} aria-label={t("avatarLabel")}>
        <div className={ui.profileHero}>
          <Avatar
            name={profile.display_name || profile.username}
            seed={profile.id}
            src={profile.avatar_url}
            size="xl"
          />
          <span className={ui.profileHeroName}>
            {profile.display_name || profile.username}
          </span>
          <span className={`${ui.profileHeroHandle} handle`}>@{profile.username}</span>
          <div className={`${ui.profileActions} ${styles.avatarUpload}`}>
            <input
              id="account-avatar"
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={onAvatarChange}
            />
            <label
              htmlFor="account-avatar"
              className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSm}`}
            >
              <Camera size={16} aria-hidden />
              {t("uploadAvatar")}
            </label>
          </div>
        </div>
      </section>

      <FormFeedback />

      <form className={ui.settingsCard} onSubmit={saveProfile}>
        <div className={ui.settingsCardBody}>
          <div className={ui.field}>
            <label className={ui.fieldLabel} htmlFor="account-display">
              {t("displayNameLabel")}
            </label>
            <input
              id="account-display"
              className={ui.input}
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className={ui.field}>
            <label className={ui.fieldLabel} htmlFor="account-bio">
              {t("bioLabel")}
            </label>
            <textarea
              id="account-bio"
              className={ui.input}
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
          </div>
          <div className={ui.field}>
            <label className={ui.fieldLabel} htmlFor="account-timezone">
              {t("timezoneLabel")}
            </label>
            <input
              id="account-timezone"
              className={ui.input}
              dir="ltr"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            />
          </div>
          <div className={styles.cardFoot}>
            <button
              className={`${ui.btn} ${ui.btnPrimary}`}
              type="submit"
              disabled={submitting}
            >
              {submitting ? t("submitting") : t("saveProfile")}
            </button>
          </div>
        </div>
      </form>

      <form
        className={ui.settingsCard}
        onSubmit={onUsernameChange}
        aria-labelledby="username-heading"
      >
        <div className={ui.settingsCardHead}>
          <h2 id="username-heading" className={ui.settingsCardTitle}>
            {t("changeUsername")}
          </h2>
          <p className={ui.settingsCardDesc}>{t("usernameCooldownHint")}</p>
        </div>
        <div className={ui.settingsCardBody}>
          <div className={ui.field}>
            <label className={ui.fieldLabel} htmlFor="account-username">
              {t("usernameLabel")}
            </label>
            <div className={ui.inputPrefix}>
              <span aria-hidden>@</span>
              <input
                id="account-username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
              />
            </div>
          </div>
          <div className={styles.cardFoot}>
            <button
              className={`${ui.btn} ${ui.btnSecondary}`}
              type="submit"
              disabled={submitting}
            >
              {t("changeUsername")}
            </button>
          </div>
        </div>
      </form>

      <section className={ui.settingsCard} aria-labelledby="export-heading">
        <div className={ui.settingsCardHead}>
          <h2 id="export-heading" className={ui.settingsCardTitle}>
            {t("exportTitle")}
          </h2>
          <p className={ui.settingsCardDesc}>{t("exportHint")}</p>
        </div>
        <div className={ui.settingsCardBody}>
          <div className={styles.cardFoot}>
            <button
              className={`${ui.btn} ${ui.btnSecondary}`}
              type="button"
              disabled={submitting}
              onClick={onExport}
            >
              {t("exportSubmit")}
            </button>
          </div>
        </div>
      </section>

      <form
        className={ui.settingsCard}
        onSubmit={onDelete}
        aria-labelledby="delete-heading"
      >
        <div className={ui.settingsCardHead}>
          <h2
            id="delete-heading"
            className={`${ui.settingsCardTitle} ${styles.dangerTitle}`}
          >
            {t("deleteAccountTitle")}
          </h2>
          <p className={ui.settingsCardDesc}>{t("deleteAccountHint")}</p>
        </div>
        <div className={ui.settingsCardBody}>
          <div className={ui.field}>
            <label className={ui.fieldLabel} htmlFor="delete-confirm">
              {t("deleteConfirmLabel")}
            </label>
            <input
              id="delete-confirm"
              className={ui.input}
              dir="ltr"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className={styles.cardFoot}>
            <button
              className={`${ui.btn} ${ui.btnDanger}`}
              type="submit"
              disabled={submitting}
            >
              {t("deleteSubmit")}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}

function AccountSettingsRoot(props: AccountSettingsProps) {
  return (
    <IdentityFormProvider>
      <AccountSettingsInner {...props} />
    </IdentityFormProvider>
  );
}

export const AccountSettings = memo(AccountSettingsRoot);
