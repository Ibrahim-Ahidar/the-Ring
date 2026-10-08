"use client";

import { memo } from "react";
import { useLocale, useTranslations } from "next-intl";

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
    <div className={styles.stack}>
      <section aria-labelledby="sessions-heading">
        <h2 id="sessions-heading" className={styles.label}>
          {t("sessionsTitle")}
        </h2>
        <p className={styles.hint}>{t("sessionsHint")}</p>
        <ul className={styles.sessionList}>
          {activeSessions.map((session) => {
            const isCurrent = session.id === currentDeviceId;
            return (
              <li key={session.id} className={styles.sessionItem}>
                <div>
                  <strong>
                    {session.device_label ??
                      (isCurrent ? t("currentSession") : session.id.slice(0, 8))}
                  </strong>
                  <p className={styles.hint}>
                    {t("lastSeen", {
                      when: formatWhen(session.last_seen_at, locale),
                    })}
                  </p>
                </div>
                {!isCurrent ? (
                  <button
                    type="button"
                    className={styles.buttonSecondary}
                    disabled={submitting}
                    onClick={() => revoke(session.id)}
                  >
                    {t("revokeSession")}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
      <FormFeedback />
      <button
        type="button"
        className={styles.buttonSecondary}
        disabled={submitting}
        onClick={signOut}
      >
        {t("signOut")}
      </button>
    </div>
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
