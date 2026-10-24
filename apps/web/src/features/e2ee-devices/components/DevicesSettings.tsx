"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { removeDeviceAction } from "../actions";
import styles from "../e2ee-devices.module.css";
import { useDevicesSession } from "../hooks/use-devices-session";
import { setDeviceApproval, type E2eeDevice } from "../service";

import { FreshDevicePanel } from "./FreshDevicePanel";

type Props = { devices: E2eeDevice[] };

export function DevicesSettings({ devices }: Props) {
  const t = useTranslations("e2ee-devices");
  const format = useFormatter();
  const router = useRouter();
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { supabase, rpc } = useDevicesSession();
  const [requireApproval, setRequireApproval] = useState(true);

  useEffect(() => {
    let live = true;
    // Owner-readable row; keep the default (on) when it cannot be read.
    void (
      supabase.from("account_keys" as never) as unknown as {
        select(c: string): {
          maybeSingle(): Promise<{ data: { require_approval?: boolean } | null }>;
        };
      }
    )
      .select("require_approval")
      .maybeSingle()
      .then(({ data }) => {
        if (live && typeof data?.require_approval === "boolean") {
          setRequireApproval(data.require_approval);
        }
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [supabase]);

  async function toggleApproval(next: boolean) {
    setRequireApproval(next);
    const res = await setDeviceApproval(rpc, next);
    if (!res.ok) {
      setRequireApproval(!next);
      setError(t("errorUnexpected"));
    }
  }

  const visible = devices.filter((d) => !removed.has(d.id));

  async function remove(device: E2eeDevice) {
    setBusyId(device.id);
    setError(null);
    const res = await removeDeviceAction(device.id);
    setBusyId(null);
    setConfirmId(null);
    if (!res.ok) {
      setError(
        res.error.code === "e2ee.device_not_found"
          ? t("errorNotFound")
          : t("errorUnexpected"),
      );
      return;
    }
    setRemoved((prev) => new Set(prev).add(device.id));
    router.refresh();
  }

  if (!devices.some((d) => d.is_current_session)) {
    return <FreshDevicePanel />;
  }

  if (visible.length === 0) {
    return <p className={styles.meta}>{t("empty")}</p>;
  }

  return (
    <>
      <label className={styles.meta}>
        <input
          type="checkbox"
          checked={requireApproval}
          onChange={(e) => void toggleApproval(e.target.checked)}
        />{" "}
        {t("approvalToggle")}
      </label>
      {requireApproval ? null : <p className={styles.meta}>{t("approvalToggleHelp")}</p>}
      <p className={styles.meta}>{t("intro")}</p>
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      <ul className={styles.list}>
        {visible.map((device) => (
          <li key={device.id} className={styles.row}>
            <span className={styles.body}>
              <span className={styles.name}>{device.name ?? t("unnamed")}</span>
              <span className={styles.meta}>
                {device.platform}
                {device.last_seen_at
                  ? ` · ${t("lastSeen", {
                      when: format.dateTime(new Date(device.last_seen_at), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }),
                    })}`
                  : ""}
              </span>
            </span>
            {device.is_current_session ? (
              <span className={styles.badge}>{t("thisDevice")}</span>
            ) : null}
            {confirmId === device.id ? (
              <button
                type="button"
                className={styles.remove}
                disabled={busyId === device.id}
                onClick={() => void remove(device)}
              >
                {t("confirmRemove")}
              </button>
            ) : (
              <button
                type="button"
                className={styles.remove}
                onClick={() => setConfirmId(device.id)}
              >
                {t("remove")}
              </button>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
