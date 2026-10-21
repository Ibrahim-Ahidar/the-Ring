"use client";

import { Camera, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import {
  AVATAR_MAX_MB,
  AVATAR_MIME_TYPES,
  checkAvatarFile,
  type AvatarFileProblem,
} from "@/platform/avatars";
import { ConfirmDialog } from "@/features/groups/components/ConfirmDialog";
import { Avatar } from "@/shell/components/Avatar";
import ui from "@/shell/styles/ui.module.css";
import {
  changeUsernameAction,
  deleteAccountAction,
  removeAvatarAction,
  updateProfileAction,
  uploadAvatarAction,
} from "../actions";
import styles from "../identity.module.css";
import type { OwnProfile } from "../types";
import { ChangeEmailCard } from "./ChangeEmailCard";

const BIO_MAX = 160;
const COOLDOWN_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

type Feedback = { kind: "error" | "success"; message: string };

function CardFeedback({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) {
    return null;
  }
  return feedback.kind === "error" ? (
    <p className={styles.error} role="alert">
      {feedback.message}
    </p>
  ) : (
    <p className={styles.success} role="status">
      {feedback.message}
    </p>
  );
}

function timeZoneOptions(current: string): string[] {
  let zones: string[] = [];
  try {
    zones = (
      Intl as unknown as { supportedValuesOf(key: string): string[] }
    ).supportedValuesOf("timeZone");
  } catch {
    zones = [];
  }
  return zones.includes(current) ? zones : [current, ...zones];
}

type AccountSettingsProps = {
  profile: OwnProfile;
  email: string;
  pendingEmail: string | null;
};

function AccountSettingsInner({
  profile,
  email,
  pendingEmail,
}: AccountSettingsProps) {
  const t = useTranslations("identity");
  const locale = useLocale();
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  // Browser time zone differs from the server's, so resolve it after mount to
  // keep the server and first client render identical (no hydration warning).
  const [timezone, setTimezone] = useState(profile.timezone ?? "");
  const [newUsername, setNewUsername] = useState(profile.username);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [usernameBusy, setUsernameBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<Feedback | null>(null);
  const [usernameFeedback, setUsernameFeedback] = useState<Feedback | null>(
    null,
  );
  const [deleteFeedback, setDeleteFeedback] = useState<Feedback | null>(null);
  const [changedAt, setChangedAt] = useState(profile.username_changed_at);
  const [zones, setZones] = useState<string[]>([]);
  useEffect(() => {
    const browser = Intl.DateTimeFormat().resolvedOptions().timeZone;
    setZones(timeZoneOptions(profile.timezone || browser));
    if (!profile.timezone) setTimezone((cur) => cur || browser);
  }, [profile.timezone]);
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState<"upload" | "remove" | null>(
    null,
  );
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarStatus, setAvatarStatus] = useState<string | null>(null);

  const [seenAvatarUrl, setSeenAvatarUrl] = useState(profile.avatar_url);

  // Once the refreshed profile arrives, drop the local preview.
  if (seenAvatarUrl !== profile.avatar_url) {
    setSeenAvatarUrl(profile.avatar_url);
    setPreview(null);
    setRemoved(false);
  }

  useEffect(() => {
    if (!preview) {
      return;
    }
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const avatarSrc = preview ?? (removed ? null : profile.avatar_url);
  const hasAvatar = Boolean(avatarSrc);

  function formatDate(date: Date): string {
    return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(date);
  }

  const nextChange = changedAt
    ? new Date(new Date(changedAt).getTime() + COOLDOWN_DAYS * DAY_MS)
    : null;
  const coolingDown = nextChange !== null && nextChange.getTime() > Date.now();

  async function saveProfile(event: React.FormEvent) {
    event.preventDefault();
    setProfileBusy(true);
    setProfileFeedback(null);
    const result = await updateProfileAction({ displayName, bio, timezone });
    setProfileBusy(false);
    if (result.ok) {
      setProfileFeedback({ kind: "success", message: t("savedProfile") });
      router.refresh();
    } else {
      setProfileFeedback({
        kind: "error",
        message: errorMessageFor(result.error.code),
      });
    }
  }

  async function onUsernameChange(event: React.FormEvent) {
    event.preventDefault();
    setUsernameBusy(true);
    setUsernameFeedback(null);
    const result = await changeUsernameAction(newUsername);
    setUsernameBusy(false);
    if (result.ok) {
      const now = new Date();
      setChangedAt(now.toISOString());
      setUsernameFeedback({
        kind: "success",
        message: t("usernameChanged", {
          date: formatDate(new Date(now.getTime() + COOLDOWN_DAYS * DAY_MS)),
        }),
      });
      router.refresh();
    } else {
      setUsernameFeedback({
        kind: "error",
        message: errorMessageFor(result.error.code),
      });
    }
  }

  function showAvatarProblem(problem: AvatarFileProblem, sizeBytes: number) {
    if (problem === "too_large") {
      const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(1);
      setAvatarError(
        t("avatarTooLarge", { sizeMb, maxMb: String(AVATAR_MAX_MB) }),
      );
    } else if (problem === "empty") {
      setAvatarError(t("avatarEmpty"));
    } else {
      setAvatarError(t("avatarUnsupportedType"));
    }
  }

  async function onAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    input.value = "";
    if (!file) {
      return;
    }
    setAvatarError(null);
    setAvatarStatus(null);

    const problem = checkAvatarFile(file);
    if (problem) {
      showAvatarProblem(problem, file.size);
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setPreview(previewUrl);
    setAvatarBusy("upload");
    const formData = new FormData();
    formData.set("avatar", file);
    const result = await uploadAvatarAction(formData);
    setAvatarBusy(null);
    if (result.ok) {
      setAvatarStatus(t("avatarSaved"));
      router.refresh();
    } else {
      setPreview(null);
      setAvatarError(errorMessageFor(result.error.code));
    }
  }

  async function onAvatarRemove() {
    setAvatarError(null);
    setAvatarStatus(null);
    setAvatarBusy("remove");
    const result = await removeAvatarAction();
    setAvatarBusy(null);
    if (result.ok) {
      setPreview(null);
      setRemoved(true);
      setAvatarStatus(t("avatarRemoved"));
      router.refresh();
    } else {
      setAvatarError(errorMessageFor(result.error.code));
    }
  }

  function errorMessageFor(code: string): string {
    const key = `errors.${code}` as "errors.identity.avatar_rejected";
    return t.has(key) ? t(key) : t("errors.platform.unexpected");
  }

  const deleteMatches = deleteConfirm === `@${profile.username}`;

  function onDeleteSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (deleteMatches) {
      setConfirmingDelete(true);
    }
  }

  async function onDelete() {
    setConfirmingDelete(false);
    setDeleteBusy(true);
    setDeleteFeedback(null);
    const result = await deleteAccountAction(deleteConfirm.replace(/^@/, ""));
    if (!result.ok) {
      setDeleteBusy(false);
      setDeleteFeedback({
        kind: "error",
        message: errorMessageFor(result.error.code),
      });
    }
  }

  return (
    <>
      <section className={ui.settingsCard} aria-label={t("avatarLabel")}>
        <div className={ui.profileHero}>
          <Avatar
            name={profile.display_name || profile.username}
            seed={profile.id}
            src={avatarSrc}
            size="xl"
            className={
              avatarBusy === "upload" ? styles.avatarPending : undefined
            }
          />
          <span className={ui.profileHeroName}>
            {profile.display_name || profile.username}
          </span>
          <span className={`${ui.profileHeroHandle} handle`}>
            @{profile.username}
          </span>
          <div className={`${ui.profileActions} ${styles.avatarUpload}`}>
            <input
              id="account-avatar"
              className="sr-only"
              type="file"
              accept={AVATAR_MIME_TYPES.join(",")}
              aria-describedby="account-avatar-hint"
              disabled={avatarBusy !== null}
              onChange={onAvatarChange}
            />
            <label
              htmlFor="account-avatar"
              className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSm}`}
              aria-disabled={avatarBusy !== null || undefined}
            >
              <Camera size={16} aria-hidden />
              {t("uploadAvatar")}
            </label>
            {hasAvatar ? (
              <button
                type="button"
                className={`${ui.btn} ${ui.btnGhost} ${ui.btnSm}`}
                disabled={avatarBusy !== null}
                onClick={onAvatarRemove}
              >
                <Trash2 size={16} aria-hidden />
                {t("removeAvatar")}
              </button>
            ) : null}
          </div>
          <p id="account-avatar-hint" className={styles.avatarHint}>
            {t("avatarHint", { maxMb: String(AVATAR_MAX_MB) })}
          </p>
          {avatarBusy === "upload" ? (
            <div className={styles.avatarProgress} role="status">
              <progress aria-label={t("avatarUploading")} />
              <span>{t("avatarUploading")}</span>
            </div>
          ) : null}
          {avatarError ? (
            <p className={styles.error} role="alert">
              {avatarError}
            </p>
          ) : null}
          {avatarStatus ? (
            <p className={styles.success} role="status">
              {avatarStatus}
            </p>
          ) : null}
        </div>
      </section>

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
              maxLength={BIO_MAX}
              aria-describedby="account-bio-count"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
            <span id="account-bio-count" className={styles.avatarHint}>
              {t("bioCount", { count: bio.length, max: BIO_MAX })}
            </span>
          </div>
          <div className={ui.field}>
            <label className={ui.fieldLabel} htmlFor="account-timezone">
              {t("timezoneLabel")}
            </label>
            <input
              id="account-timezone"
              className={ui.input}
              dir="ltr"
              list="account-timezone-list"
              autoComplete="off"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            />
            <datalist id="account-timezone-list">
              {zones.map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
          </div>
          <div className={styles.cardFoot}>
            <button
              className={`${ui.btn} ${ui.btnPrimary}`}
              type="submit"
              disabled={profileBusy}
            >
              {profileBusy ? t("submitting") : t("saveProfile")}
            </button>
          </div>
          <CardFeedback feedback={profileFeedback} />
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
          <p className={ui.settingsCardDesc}>
            {coolingDown && nextChange
              ? t("usernameNextChange", { date: formatDate(nextChange) })
              : t("usernameCooldownHint")}
          </p>
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
              disabled={usernameBusy}
            >
              {usernameBusy ? t("submitting") : t("changeUsername")}
            </button>
          </div>
          <CardFeedback feedback={usernameFeedback} />
        </div>
      </form>

      <ChangeEmailCard email={email} pendingEmail={pendingEmail} />

      <section className={ui.settingsCard} aria-labelledby="export-heading">
        <div className={ui.settingsCardHead}>
          <h2 id="export-heading" className={ui.settingsCardTitle}>
            {t("exportTitle")}{" "}
            <span className={`${ui.tag} ${ui.tagNeutral}`}>
              {t("comingSoon")}
            </span>
          </h2>
          <p className={ui.settingsCardDesc}>{t("exportHint")}</p>
        </div>
        <div className={ui.settingsCardBody}>
          <div className={styles.cardFoot}>
            <button
              className={`${ui.btn} ${ui.btnSecondary}`}
              type="button"
              disabled
            >
              {t("exportSubmit")}
            </button>
          </div>
        </div>
      </section>

      <form
        className={ui.settingsCard}
        onSubmit={onDeleteSubmit}
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
              disabled={!deleteMatches || deleteBusy}
            >
              {t("deleteSubmit")}
            </button>
          </div>
          <CardFeedback feedback={deleteFeedback} />
        </div>
      </form>
      {confirmingDelete ? (
        <ConfirmDialog
          destructive
          title={t("deleteConfirmTitle")}
          body={t("deleteConfirmBody", { username: profile.username })}
          confirmLabel={t("deleteSubmit")}
          cancelLabel={t("cancel")}
          onConfirm={onDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      ) : null}
    </>
  );
}

export const AccountSettings = AccountSettingsInner;
