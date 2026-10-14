"use client";

import { useCallback, useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

import { updateNotificationPreferencesAction } from "../actions";
import type { NotificationPreferences } from "../types";
import styles from "./notifications.module.css";

type Props = {
  initial: NotificationPreferences;
};

const ROWS = [
  { key: "inAppEnabled", label: "settings.inApp", hint: "settings.inAppHint" },
  { key: "pushEnabled", label: "settings.push", hint: "settings.pushHint" },
  { key: "mentionsOnly", label: "settings.mentionsOnly", hint: "settings.mentionsOnlyHint" },
] as const;

function NotificationsSettingsFormInner({ initial }: Props) {
  const t = useTranslations("notifications");
  const idBase = useId();
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
      className={ui.settingsCard}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {ROWS.map(({ key, label, hint }) => {
        const labelId = `${idBase}-${key}`;
        const hintId = `${labelId}-hint`;
        return (
          <div key={key} className={ui.setting}>
            <span className={ui.settingBody}>
              <span id={labelId}>{t(label)}</span>
              <span id={hintId} className={ui.settingDesc}>
                {t(hint)}
              </span>
            </span>
            <button
              type="button"
              role="switch"
              className={ui.switch}
              aria-checked={prefs[key]}
              aria-labelledby={labelId}
              aria-describedby={hintId}
              onClick={() => {
                setSaved(false);
                setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
              }}
            />
          </div>
        );
      })}

      <div className={styles.formFoot}>
        {errorCode ? (
          <p className={ui.errorText} role="alert">
            {t("settings.saveError")}
          </p>
        ) : null}
        {saved ? (
          <p className={styles.saved} role="status">
            {t("settings.saved")}
          </p>
        ) : null}
        <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`} disabled={pending}>
          {pending ? t("settings.saving") : t("settings.save")}
        </button>
      </div>
    </form>
  );
}

export const NotificationsSettingsForm = NotificationsSettingsFormInner;
