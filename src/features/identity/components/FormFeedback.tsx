"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";

import styles from "../identity.module.css";
import { useIdentityForm } from "../context/identity-form-context";

function FormFeedbackInner() {
  const t = useTranslations("identity");
  const { errorCode, successMessage } = useIdentityForm();

  if (errorCode) {
    const key = `errors.${errorCode}` as "errors.identity.username_taken";
    const message = t.has(key) ? t(key) : t("errors.platform.unexpected");
    return (
      <p className={styles.error} role="alert">
        {message}
      </p>
    );
  }

  if (successMessage) {
    return (
      <p className={styles.success} role="status">
        {successMessage}
      </p>
    );
  }

  return null;
}

export const FormFeedback = memo(FormFeedbackInner);
