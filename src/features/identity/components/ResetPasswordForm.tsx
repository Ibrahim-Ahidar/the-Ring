"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useState } from "react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";
import { updatePasswordAction } from "../actions";
import { MIN_PASSWORD_LENGTH } from "../password-policy";
import { IdentityFormProvider, useIdentityForm } from "../context/identity-form-context";
import styles from "../identity.module.css";
import { FormFeedback } from "./FormFeedback";
import { PASSWORD_UPDATED_FLAG } from "./PasswordUpdatedToast";


function ResetPasswordFormInner() {
  const t = useTranslations("identity");
  const router = useRouter();
  const { submitting, errorCode, startSubmit, finishSubmit } = useIdentityForm();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = errorCode === "identity.password_mismatch";
  const rejected =
    errorCode === "identity.password_weak" || errorCode === "identity.password_same";

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    startSubmit();
    if (password.length < MIN_PASSWORD_LENGTH) {
      finishSubmit({ errorCode: "identity.password_weak" });
      return;
    }
    if (password !== confirm) {
      finishSubmit({ errorCode: "identity.password_mismatch" });
      return;
    }
    const result = await updatePasswordAction(password);
    if (!result.ok) {
      finishSubmit({ errorCode: result.error.code });
      return;
    }
    finishSubmit({ successMessage: null });
    window.sessionStorage.setItem(PASSWORD_UPDATED_FLAG, "1");
    router.replace("/app");
    router.refresh();
  }

  return (
    <form className={styles.authFormBody} onSubmit={onSubmit} noValidate>
      <div className={styles.authFields}>
        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor="reset-password">
            {t("newPasswordLabel")}
          </label>
          <input
            id="reset-password"
            className={ui.input}
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            aria-invalid={rejected || undefined}
            aria-describedby="reset-password-hint"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <span id="reset-password-hint" className={ui.fieldHint}>
            {t("newPasswordHint", { min: MIN_PASSWORD_LENGTH })}
          </span>
        </div>
        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor="reset-password-confirm">
            {t("confirmPasswordLabel")}
          </label>
          <input
            id="reset-password-confirm"
            className={ui.input}
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={mismatch || undefined}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
      </div>
      <FormFeedback />
      <button
        className={`${ui.btn} ${ui.btnPrimary} ${ui.btnBlock}`}
        type="submit"
        disabled={submitting}
      >
        {submitting ? t("submitting") : t("submitNewPassword")}
      </button>
      {errorCode === "identity.reset_session_expired" ? (
        <p className={styles.authSwitch}>
          <Link href="/forgot-password">{t("requestNewCode")}</Link>
        </p>
      ) : null}
    </form>
  );
}

function ResetPasswordFormRoot() {
  return (
    <IdentityFormProvider>
      <ResetPasswordFormInner />
    </IdentityFormProvider>
  );
}

export const ResetPasswordForm = memo(ResetPasswordFormRoot);

