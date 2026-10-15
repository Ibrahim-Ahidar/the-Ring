"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";

import styles from "../identity.module.css";
import { useIdentityForm } from "../context/identity-form-context";

/** Translated message for an error code, falling back to the generic one. */
export function useErrorMessage(errorCode: string | null): string | null {
  const t = useTranslations("identity");
  if (!errorCode) {
    return null;
  }
  const key = `errors.${errorCode}` as "errors.identity.username_taken";
  return t.has(key) ? t(key) : t("errors.platform.unexpected");
}

type Props = {
  /** Codes the form shows next to a field instead of in this banner. */
  exclude?: (errorCode: string) => boolean;
  /** Lets fields point `aria-describedby` at the banner. */
  id?: string;
};

function FormFeedbackInner({ exclude, id }: Props) {
  const { errorCode, successMessage } = useIdentityForm();
  const shown = errorCode && !exclude?.(errorCode) ? errorCode : null;
  const message = useErrorMessage(shown);

  if (message) {
    return (
      <p id={id} className={styles.error} role="alert">
        {message}
      </p>
    );
  }

  if (successMessage) {
    return (
      <p id={id} className={styles.success} role="status">
        {successMessage}
      </p>
    );
  }

  return null;
}

export const FormFeedback = memo(FormFeedbackInner);
