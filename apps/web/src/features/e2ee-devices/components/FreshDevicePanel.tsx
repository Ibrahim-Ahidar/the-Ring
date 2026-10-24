"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { openAccountKeyStore } from "@/platform/crypto/account-key";
import { createCryptoEngine } from "@/platform/crypto/create-engine";

import { startFreshDevice, waitForApproval } from "../devices-changed";
import styles from "../e2ee-devices.module.css";
import { useDevicesSession } from "../hooks/use-devices-session";

const DEVICE_ID_KEY = "pulse.e2ee.deviceId";
const POLL_MS = 3000;
const MAX_POLLS = 600;

function localDeviceId(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_ID_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

type Phase = "idle" | "waiting" | "approved" | "denied" | "error";

/** Shown when this browser has no registered device: register, wait for approval, or replace the key. */
export function FreshDevicePanel() {
  const t = useTranslations("e2ee-devices");
  const router = useRouter();
  const { rpc, announce } = useDevicesSession();
  const [phase, setPhase] = useState<Phase>("idle");
  const [confirmLost, setConfirmLost] = useState(false);
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    return () => {
      cancelled.current = true;
    };
  }, []);

  async function begin(lost: boolean) {
    setPhase("idle");
    const deviceId = localDeviceId();
    const started = await startFreshDevice(
      rpc,
      createCryptoEngine(),
      { deviceId, name: t("unnamedWeb"), platform: "web" },
      lost,
      await openAccountKeyStore(),
    ).catch(() => null);
    if (!started || !started.ok) {
      setPhase("error");
      return;
    }
    announce(lost ? "security_code_changed" : "device_changed");
    if (started.value !== "pending") {
      setPhase("approved");
      router.refresh();
      return;
    }
    setPhase("waiting");
    const done = await waitForApproval(rpc, deviceId, {
      intervalMs: POLL_MS,
      maxPolls: MAX_POLLS,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      isCancelled: () => cancelled.current,
    });
    if (cancelled.current) return;
    if (!done.ok) setPhase("error");
    else if (done.value === "approved") {
      setPhase("approved");
      router.refresh();
    } else if (done.value === "gone") setPhase("denied");
  }

  if (phase === "waiting") {
    return (
      <div className={styles.waiting} role="status">
        <strong>{t("waitingTitle")}</strong>
        <p className={styles.meta}>{t("waitingBody")}</p>
      </div>
    );
  }
  if (phase === "approved") return <p role="status">{t("approved")}</p>;

  return (
    <div className={styles.waiting}>
      <p className={styles.meta}>{t("startFresh")}</p>
      {phase === "denied" ? <p role="alert">{t("denied")}</p> : null}
      {phase === "error" ? (
        <p role="alert" className={styles.error}>
          {t("errorUnexpected")}
        </p>
      ) : null}
      <span className={styles.actions}>
        <button type="button" onClick={() => void begin(false)}>
          {t("register")}
        </button>
        {confirmLost ? (
          <button type="button" className={styles.remove} onClick={() => void begin(true)}>
            {t("lostDevicesConfirm")}
          </button>
        ) : (
          <button type="button" className={styles.remove} onClick={() => setConfirmLost(true)}>
            {t("lostDevices")}
          </button>
        )}
      </span>
      {confirmLost ? <p className={styles.meta}>{t("lostDevicesWarn")}</p> : null}
    </div>
  );
}
