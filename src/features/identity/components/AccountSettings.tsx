"use client";

import { memo, useState } from "react";
import { useTranslations } from "next-intl";

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
    <div className={styles.stack}>
      <form className={styles.stack} onSubmit={saveProfile}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="account-display">
            {t("displayNameLabel")}
          </label>
          <input
            id="account-display"
            className={styles.input}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="account-bio">
            {t("bioLabel")}
          </label>
          <textarea
            id="account-bio"
            className={styles.textarea}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="account-timezone">
            {t("timezoneLabel")}
          </label>
          <input
            id="account-timezone"
            className={styles.input}
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
          />
        </div>
        <FormFeedback />
        <button className={styles.button} type="submit" disabled={submitting}>
          {submitting ? t("submitting") : t("saveProfile")}
        </button>
      </form>

      <div className={styles.field}>
        <label className={styles.label} htmlFor="account-avatar">
          {t("avatarLabel")}
        </label>
        <input
          id="account-avatar"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={onAvatarChange}
        />
      </div>

      <form className={styles.section} onSubmit={onUsernameChange}>
        <h2 className={styles.label}>{t("changeUsername")}</h2>
        <p className={styles.hint}>{t("usernameCooldownHint")}</p>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="account-username">
            {t("usernameLabel")}
          </label>
          <input
            id="account-username"
            className={styles.input}
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
          />
        </div>
        <button className={styles.buttonSecondary} type="submit" disabled={submitting}>
          {t("changeUsername")}
        </button>
      </form>

      <section className={styles.section} aria-labelledby="export-heading">
        <h2 id="export-heading" className={styles.label}>
          {t("exportTitle")}
        </h2>
        <p className={styles.hint}>{t("exportHint")}</p>
        <button
          className={styles.buttonSecondary}
          type="button"
          disabled={submitting}
          onClick={onExport}
        >
          {t("exportSubmit")}
        </button>
      </section>

      <form className={styles.section} onSubmit={onDelete}>
        <h2 className={styles.label}>{t("deleteAccountTitle")}</h2>
        <p className={styles.hint}>{t("deleteAccountHint")}</p>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="delete-confirm">
            {t("deleteConfirmLabel")}
          </label>
          <input
            id="delete-confirm"
            className={styles.input}
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            autoComplete="off"
          />
        </div>
        <button className={styles.buttonDanger} type="submit" disabled={submitting}>
          {t("deleteSubmit")}
        </button>
      </form>
    </div>
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
