"use client";

import { memo, useCallback, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { updateNotificationPreferencesAction } from "../actions";
import type { NotificationPreferences } from "../types";
import styles from "./notifications.module.css";

type Props = {
  initial: NotificationPreferences;
};

function NotificationsSettingsFormInner({ initial }: Props) {
  const t = useTranslations("notifications");
  const [prefs, setPrefs] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = useCallback(() => {
    setSaved(false);
    setErrorCode(null);
    startTransition(async () => {
      const result = await updateNotificationPreferencesAction(prefs);
      if (result.ok) {
        setPrefs(result.value);
        setSaved(true);
      } else {
        setErrorCode(result.error.code);
      }
    });
  }, [prefs]);

  return (
    <form
      className={styles.settingsForm}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label className={styles.field}>
        <input
          type="checkbox"
          checked={prefs.inAppEnabled}
          onChange={(event) =>
            setPrefs((prev) => ({
              ...prev,
              inAppEnabled: event.target.checked,
            }))
          }
        />
        <span className={styles.fieldLabel}>
          <span>{t("settings.inApp")}</span>
          <p className={styles.fieldHint}>{t("settings.inAppHint")}</p>
        </span>
      </label>

      <label className={styles.field}>
        <input
          type="checkbox"
          checked={prefs.pushEnabled}
          onChange={(event) =>
            setPrefs((prev) => ({
              ...prev,
              pushEnabled: event.target.checked,
            }))
          }
        />
        <span className={styles.fieldLabel}>
          <span>{t("settings.push")}</span>
          <p className={styles.fieldHint}>{t("settings.pushHint")}</p>
        </span>
      </label>

      <label className={styles.field}>
        <input
          type="checkbox"
          checked={prefs.mentionsOnly}
          onChange={(event) =>
            setPrefs((prev) => ({
              ...prev,
              mentionsOnly: event.target.checked,
            }))
          }
        />
        <span className={styles.fieldLabel}>
          <span>{t("settings.mentionsOnly")}</span>
          <p className={styles.fieldHint}>{t("settings.mentionsOnlyHint")}</p>
        </span>
      </label>

      {errorCode ? (
        <p role="alert">{t("settings.saveError")}</p>
      ) : null}
      {saved ? (
        <p role="status">{t("settings.saved")}</p>
      ) : null}

      <button
        type="submit"
        className={styles.primaryButton}
        disabled={pending}
      >
        {pending ? t("settings.saving") : t("settings.save")}
      </button>
    </form>
  );
}

export const NotificationsSettingsForm = memo(NotificationsSettingsFormInner);
