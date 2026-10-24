"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { openPersistentEngine } from "@/platform/crypto/account-key";
import { ensureDeviceId } from "@/platform/crypto/device-id";
import { getActiveE2eeRuntime, getE2eePendingState } from "@/platform/crypto/e2ee-runtime";

import { startFreshDevice, waitForApproval } from "../devices-changed";
import styles from "../e2ee-devices.module.css";
import { useDevicesSession } from "../hooks/use-devices-session";

const POLL_MS = 3000;
const MAX_POLLS = 600;

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
    const deviceId = await ensureDeviceId().catch(() => null);
    const opened = deviceId ? await openPersistentEngine().catch(() => null) : null;
    const started =
      deviceId && opened
        ? await startFreshDevice(
            rpc,
            opened.engine,
            { deviceId, name: t("unnamedWeb"), platform: "web" },
            lost,
            opened.accountKeys,
            opened.persist,
          ).catch(() => null)
        : null;
    if (!deviceId || !started || !started.ok) {
      setPhase("error");
      return;
    }
    announce(lost ? "security_code_changed" : "device_changed");
    if (started.value !== "pending") {
      setPhase("approved");
      router.refresh();
      return;
    }
    await wait(deviceId);
  }

  // The runtime found this device unapproved: go straight to the waiting screen.
  useEffect(() => {
    void getActiveE2eeRuntime().then(() => {
      const state = getE2eePendingState();
      if (state && !cancelled.current) void wait(state.deviceId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function wait(deviceId: string) {
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
