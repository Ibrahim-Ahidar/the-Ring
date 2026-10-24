"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { isE2eeEnabled } from "@pulse/core";

import { openAccountKeyStore } from "@/platform/crypto/account-key";

import { allowPendingDevice } from "../devices-changed";
import styles from "../e2ee-devices.module.css";
import { TAB_ORIGIN, useDevicesSession } from "../hooks/use-devices-session";
import { useDevicesTopic } from "../hooks/use-devices-topic";
import { denyDevice, listPendingDevices, type PendingDevice } from "../service";

const POLL_MS = 10_000;

function Watcher() {
  const t = useTranslations("e2ee-devices");
  const { supabase, rpc, userId, announce } = useDevicesSession();
  const [pending, setPending] = useState<PendingDevice[]>([]);
  const [alert, setAlert] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    const res = await listPendingDevices(rpc);
    if (alive.current && res.ok) setPending(res.value);
  }, [rpc]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => {
      alive.current = false;
      clearInterval(timer);
    };
  }, [refresh]);

  // Our own topic: our device list changed. Refresh, and alert unless this tab did it.
  useDevicesTopic(supabase, userId, (payload) => {
    void refresh();
    if (payload.origin !== TAB_ORIGIN) setAlert(true);
  });

  async function decide(device: PendingDevice, allow: boolean) {
    setBusy(device.id);
    setError(false);
    const res = allow
      ? await allowPendingDevice(rpc, await openAccountKeyStore(), device).catch(() => null)
      : await denyDevice(rpc, device.id);
    setBusy(null);
    if (!res || !res.ok) {
      setError(true);
      return;
    }
    announce("device_changed");
    await refresh();
  }

  if (pending.length === 0 && !alert && !error) return null;
  return (
    <div className={styles.overlay} role="region" aria-live="polite">
      {pending.map((device) => (
        <div key={device.id} className={styles.prompt}>
          <strong>{t("approvalTitle")}</strong>
          <span className={styles.meta}>
            {t("approvalBody", { name: device.name ?? t("unnamed"), platform: device.platform })}
          </span>
          <span className={styles.actions}>
            <button
              type="button"
              disabled={busy === device.id}
              onClick={() => void decide(device, true)}
            >
              {t("allow")}
            </button>
            <button
              type="button"
              disabled={busy === device.id}
              onClick={() => void decide(device, false)}
            >
              {t("deny")}
            </button>
          </span>
        </div>
      ))}
      {error ? (
        <p role="alert" className={styles.error}>
          {t("errorApproval")}
        </p>
      ) : null}
      {alert ? (
        <div className={styles.prompt}>
          <span>{t("alertOtherDevice")}</span>
          <button type="button" onClick={() => setAlert(false)}>
            {t("dismiss")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Shell overlay: Allow / Deny prompt and the "device list changed" alert. */
export function DevicesWatcher() {
  if (!isE2eeEnabled()) return null;
  return <Watcher />;
}
