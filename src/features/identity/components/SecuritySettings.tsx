"use client";

import { LogOut, Monitor } from "lucide-react";
import { memo } from "react";
import { useLocale, useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";
import { revokeSessionAction, signOutAction } from "../actions";
import { IdentityFormProvider, useIdentityForm } from "../context/identity-form-context";
import styles from "../identity.module.css";
import type { DeviceSession } from "../types";
import { FormFeedback } from "./FormFeedback";

type SecuritySettingsProps = {
  sessions: DeviceSession[];
  currentDeviceId?: string;
};

function formatWhen(iso: string | null, locale: string): string {
  if (!iso) {
    return "—";
  }
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

function SecuritySettingsInner({
  sessions,
  currentDeviceId,
}: SecuritySettingsProps) {
  const t = useTranslations("identity");
  const locale = useLocale();
  const { submitting, startSubmit, finishSubmit } = useIdentityForm();

  const activeSessions = sessions.filter((s) => !s.revoked_at);

  async function revoke(deviceId: string) {
    startSubmit();
    const result = await revokeSessionAction(deviceId);
    finishSubmit(
      result.ok ? { successMessage: null } : { errorCode: result.error.code },
    );
    if (result.ok) {
      window.location.reload();
    }
  }

  async function signOut() {
    startSubmit();
    await signOutAction();
  }

  return (
    <>
      <section className={ui.settingsCard} aria-labelledby="sessions-heading">
        <div className={ui.settingsCardHead}>
          <h2 id="sessions-heading" className={ui.settingsCardTitle}>
            {t("sessionsTitle")}
          </h2>
          <p className={ui.settingsCardDesc}>{t("sessionsHint")}</p>
        </div>
        <ul className={styles.sessionList}>
          {activeSessions.map((session) => {
            const isCurrent = session.id === currentDeviceId;
            return (
              <li key={session.id} className={ui.setting}>
                <Monitor size={24} aria-hidden />
                <span className={ui.settingBody}>
                  <span className={styles.sessionName}>
                    {session.device_label ??
                      (isCurrent ? t("currentSession") : session.id.slice(0, 8))}
                  </span>
                  <span className={ui.settingDesc}>
                    {t("lastSeen", {
                      when: formatWhen(session.last_seen_at, locale),
                    })}
                  </span>
                </span>
                {isCurrent ? (
                  session.device_label ? (
                    <span className={ui.tag}>{t("currentSession")}</span>
                  ) : null
                ) : (
                  <button
                    type="button"
                    className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSm}`}
                    disabled={submitting}
                    onClick={() => revoke(session.id)}
                  >
                    {t("revokeSession")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <FormFeedback />

      <div className={ui.settingsCard}>
        <button
          type="button"
          className={`${ui.setting} ${styles.dangerRow}`}
          disabled={submitting}
          onClick={signOut}
        >
          <LogOut size={24} className="flip-rtl" aria-hidden />
          <span className={ui.settingBody}>{t("signOut")}</span>
        </button>
      </div>
    </>
  );
}

function SecuritySettingsRoot(props: SecuritySettingsProps) {
  return (
    <IdentityFormProvider>
      <SecuritySettingsInner {...props} />
    </IdentityFormProvider>
  );
}

export const SecuritySettings = memo(SecuritySettingsRoot);
