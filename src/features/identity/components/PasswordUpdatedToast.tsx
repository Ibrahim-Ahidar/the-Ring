"use client";

import { memo, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import styles from "../identity.module.css";

/** Set by the reset form right before it navigates to /app. */
export const PASSWORD_UPDATED_FLAG = "pulse.passwordUpdated";
const PASSWORD_UPDATED_EVENT = "pulse:password-updated";
const TOAST_MS = 4000;

/**
 * Shows the toast now when it is mounted, or on its next mount when the page is
 * rebuilt or navigated first. The flag is consumed once, so it never shows twice.
 */
export function announcePasswordUpdated() {
  window.sessionStorage.setItem(PASSWORD_UPDATED_FLAG, "1");
  window.dispatchEvent(new Event(PASSWORD_UPDATED_EVENT));
}

/** App-shell overlay: one "Password updated" toast after a password reset or change. */
function PasswordUpdatedToastInner() {
  const t = useTranslations("identity");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer: number | undefined;
    function show() {
      if (window.sessionStorage.getItem(PASSWORD_UPDATED_FLAG) !== "1") {
        return;
      }
      window.sessionStorage.removeItem(PASSWORD_UPDATED_FLAG);
      setVisible(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setVisible(false), TOAST_MS);
    }
    show();
    window.addEventListener(PASSWORD_UPDATED_EVENT, show);
    return () => {
      window.removeEventListener(PASSWORD_UPDATED_EVENT, show);
      window.clearTimeout(timer);
    };
  }, []);

  if (!visible) {
    return null;
  }
  return (
    <p className={styles.toast} role="status">
      {t("passwordUpdated")}
    </p>
  );
}

export const PasswordUpdatedToast = memo(PasswordUpdatedToastInner);
