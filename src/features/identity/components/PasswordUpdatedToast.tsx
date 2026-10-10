"use client";

import { memo, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import styles from "../identity.module.css";

/** Set by the reset form right before it navigates to /app. */
export const PASSWORD_UPDATED_FLAG = "pulse.passwordUpdated";
const TOAST_MS = 4000;

/** App-shell overlay: one "Password updated" toast after a password reset. */
function PasswordUpdatedToastInner() {
  const t = useTranslations("identity");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.sessionStorage.getItem(PASSWORD_UPDATED_FLAG) !== "1") {
      return;
    }
    window.sessionStorage.removeItem(PASSWORD_UPDATED_FLAG);
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), TOAST_MS);
    return () => window.clearTimeout(timer);
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
