"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { isE2eeEnabled } from "@pulse/core";

import { getLocalStore } from "@/platform/local-store";
import styles from "../backup.module.css";
import { isFreshDevice } from "../service";
import { RestoreBackup } from "./BackupSettings";

const DISMISS_KEY = "pulse.backup.offerDismissed";

function dismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/** After sign-in on a Fresh Device (no local chats yet), offers to restore from a backup file. */
export function RestoreOffer() {
  const t = useTranslations("backup");
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isE2eeEnabled() || dismissed()) return;
    let live = true;
    void getLocalStore()
      .then(isFreshDevice)
      .then((fresh) => {
        if (live && fresh) setVisible(true);
      });
    return () => {
      live = false;
    };
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // the banner just comes back next time
    }
    setVisible(false);
  }

  if (!visible) return null;
  return (
    <aside className={styles.card} aria-label={t("offerTitle")}>
      <h2 className={styles.title}>{t("offerTitle")}</h2>
      <p className={styles.meta}>{t("offerBody")}</p>
      {open ? (
        <RestoreBackup onRestored={() => setTimeout(dismiss, 1500)} />
      ) : (
        <div className={styles.row}>
          <button type="button" className={styles.button} onClick={() => setOpen(true)}>
            {t("offerRestore")}
          </button>
          <button type="button" className={styles.button} onClick={dismiss}>
            {t("offerDismiss")}
          </button>
        </div>
      )}
    </aside>
  );
}
