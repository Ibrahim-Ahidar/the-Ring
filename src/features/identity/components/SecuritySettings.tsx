"use client";

import { LogOut, Monitor, Smartphone, Tablet } from "lucide-react";
import { useRouter } from "next/navigation";
import { memo, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";
import {
  revokeOtherSessionsAction,
  revokeSessionAction,
  signOutAction,
} from "../actions";
import { IdentityFormProvider, useIdentityForm } from "../context/identity-form-context";
import { describeDeviceLabel, type DeviceKind } from "../device-label";
import styles from "../identity.module.css";
import { formatLastActive, orderSessions } from "../session-display";
import type { DeviceSession } from "../types";
import { ChangePasswordCard } from "./ChangePasswordCard";
import { FormFeedback } from "./FormFeedback";
import { SessionConfirmDialog } from "./SessionConfirmDialog";

type SecuritySettingsProps = {
  sessions: DeviceSession[];
  currentDeviceId?: string;
};

type PendingRevoke = { kind: "one"; session: DeviceSession } | { kind: "others" };

const DEVICE_ICONS: Record<DeviceKind, typeof Monitor> = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
};

function SecuritySettingsInner({
  sessions,
  currentDeviceId,
}: SecuritySettingsProps) {
  const t = useTranslations("identity");
  const locale = useLocale();
  const router = useRouter();
  const { submitting, startSubmit, finishSubmit } = useIdentityForm();
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState<PendingRevoke | null>(null);

  const visibleSessions = useMemo(
    () =>
      orderSessions(sessions, currentDeviceId).filter((s) => !hiddenIds.has(s.id)),
    [sessions, currentDeviceId, hiddenIds],
  );
  const otherIds = visibleSessions
    .filter((s) => s.id !== currentDeviceId)
    .map((s) => s.id);

  function deviceName(session: DeviceSession): string {
    const described = describeDeviceLabel(session.device_label);
    if (described) {
      return t("deviceLabel", { browser: described.browser, os: described.os });
    }
    return session.device_label?.trim() || t("unknownDevice");
  }

  function hide(ids: string[]) {
    setHiddenIds((prev) => new Set([...prev, ...ids]));
  }

  function unhide(ids: string[]) {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }

  async function confirmRevoke() {
    if (!pending) {
      return;
    }
    const target = pending;
    setPending(null);
    const ids = target.kind === "one" ? [target.session.id] : otherIds;
    hide(ids);
    startSubmit();

    const result =
      target.kind === "one"
        ? await revokeSessionAction(target.session.id).catch(() => null)
        : await revokeOtherSessionsAction().catch(() => null);

    if (!result?.ok) {
      unhide(ids);
      finishSubmit({ errorCode: result?.error.code ?? "platform.unexpected" });
      return;
    }
    finishSubmit({
      successMessage:
        target.kind === "others"
          ? t("revokedOthers", { count: ids.length })
          : null,
    });
    router.refresh();
  }

  async function signOut() {
    startSubmit();
    // On success the action redirects to /login and never resolves here.
    const result = await signOutAction().catch(() => null);
    finishSubmit({ errorCode: result?.ok === false ? result.error.code : "platform.unexpected" });
  }

  const dialog =
    pending?.kind === "one" ? (
      <SessionConfirmDialog
        title={t("revokeConfirmTitle")}
        body={t("revokeConfirmBody", { device: deviceName(pending.session) })}
        onConfirm={confirmRevoke}
        onClose={() => setPending(null)}
      />
    ) : pending?.kind === "others" ? (
      <SessionConfirmDialog
        title={t("revokeOthersTitle")}
        body={t("revokeOthersBody")}
        onConfirm={confirmRevoke}
        onClose={() => setPending(null)}
      />
    ) : null;

  return (
    <>
      <ChangePasswordCard />

      <section className={ui.settingsCard} aria-labelledby="sessions-heading">
        <div className={ui.settingsCardHead}>
          <h2 id="sessions-heading" className={ui.settingsCardTitle}>
            {t("sessionsTitle")}
          </h2>
          <p className={ui.settingsCardDesc}>{t("sessionsHint")}</p>
        </div>
        <ul className={styles.sessionList}>
          {visibleSessions.map((session) => {
            const isCurrent = session.id === currentDeviceId;
            const kind = describeDeviceLabel(session.device_label)?.kind ?? "desktop";
            const Icon = DEVICE_ICONS[kind];
            const when = formatLastActive(session.last_seen_at, locale);
            return (
              <li key={session.id} className={ui.setting} data-session-id={session.id}>
                <Icon size={24} aria-hidden />
                <span className={ui.settingBody}>
                  {/* A localised sentence follows the page direction; a free-form
                      label picks its own (it may be Latin inside an RTL page). */}
                  <span
                    className={styles.sessionName}
                    dir={describeDeviceLabel(session.device_label) ? undefined : "auto"}
                  >
                    {deviceName(session)}
                  </span>
                  <span className={ui.settingDesc} suppressHydrationWarning>
                    {isCurrent && !when
                      ? t("activeNow")
                      : t("lastSeen", { when: when ?? t("justNow") })}
                  </span>
                </span>
                {isCurrent ? (
                  <span className={ui.tag}>{t("currentSession")}</span>
                ) : (
                  <button
                    type="button"
                    className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSm}`}
                    disabled={submitting}
                    onClick={() => setPending({ kind: "one", session })}
                  >
                    {t("revokeSession")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {otherIds.length > 0 ? (
          <button
            type="button"
            className={`${ui.setting} ${styles.dangerRow}`}
            disabled={submitting}
            onClick={() => setPending({ kind: "others" })}
          >
            <LogOut size={24} className="flip-rtl" aria-hidden />
            <span className={ui.settingBody}>{t("revokeOthers")}</span>
          </button>
        ) : null}
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

      {dialog}
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
