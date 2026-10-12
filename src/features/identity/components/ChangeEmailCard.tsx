"use client";

import { memo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";
import { changeEmailAction } from "../actions";
import { IdentityFormProvider, useIdentityForm } from "../context/identity-form-context";
import styles from "../identity.module.css";
import { emailError } from "../validation";
import { FormFeedback, useErrorMessage } from "./FormFeedback";

type Props = {
  email: string;
  /** Set while a change waits for confirmation from both addresses. */
  pendingEmail: string | null;
};

function ChangeEmailCardInner({ email, pendingEmail: initialPending }: Props) {
  const t = useTranslations("identity");
  const { submitting, startSubmit, finishSubmit, clearFeedback, errorCode } = useIdentityForm();
  const [value, setValue] = useState("");
  const [pendingEmail, setPendingEmail] = useState(initialPending);
  const [fieldCode, setFieldCode] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldError = useErrorMessage(fieldCode);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    clearFeedback();
    const invalid = emailError(value);
    if (invalid) {
      setFieldCode(invalid);
      inputRef.current?.focus();
      return;
    }

    startSubmit();
    const result = await changeEmailAction(value);
    if (!result.ok) {
      if (result.error.code.startsWith("identity.email_")) {
        finishSubmit({});
        setFieldCode(result.error.code);
        inputRef.current?.focus();
      } else {
        finishSubmit({ errorCode: result.error.code });
      }
      return;
    }
    finishSubmit({});
    setValue("");
    setPendingEmail(result.value.pendingEmail);
  }

  return (
    <form
      className={ui.settingsCard}
      onSubmit={onSubmit}
      noValidate
      aria-labelledby="email-heading"
      aria-busy={submitting || undefined}
    >
      <div className={ui.settingsCardHead}>
        <h2 id="email-heading" className={ui.settingsCardTitle}>
          {t("emailTitle")}
        </h2>
        <p className={ui.settingsCardDesc}>
          {t.rich("emailHint", { email: () => <bdi dir="ltr">{email}</bdi> })}
        </p>
      </div>
      <div className={ui.settingsCardBody}>
        {pendingEmail ? (
          <p className={styles.reasonBanner} role="status">
            {t.rich("emailPending", { email: () => <bdi dir="ltr">{pendingEmail}</bdi> })}
          </p>
        ) : null}
        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor="change-email">
            {t("newEmailLabel")}
          </label>
          <input
            ref={inputRef}
            id="change-email"
            className={ui.input}
            type="email"
            autoComplete="email"
            dir="ltr"
            aria-invalid={Boolean(fieldError) || undefined}
            aria-describedby={fieldError ? "change-email-error" : undefined}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setFieldCode(null);
              if (errorCode) {
                clearFeedback();
              }
            }}
          />
          {fieldError ? (
            <span id="change-email-error" className={ui.fieldError}>
              {fieldError}
            </span>
          ) : null}
        </div>
        <div className={styles.cardFoot}>
          <button
            className={`${ui.btn} ${ui.btnSecondary}`}
            type="submit"
            disabled={submitting}
            aria-busy={submitting || undefined}
          >
            {submitting ? t("submitting") : t("emailChangeSubmit")}
          </button>
        </div>
        <FormFeedback />
      </div>
    </form>
  );
}

function ChangeEmailCardRoot(props: Props) {
  return (
    <IdentityFormProvider>
      <ChangeEmailCardInner {...props} />
    </IdentityFormProvider>
  );
}

export const ChangeEmailCard = memo(ChangeEmailCardRoot);
