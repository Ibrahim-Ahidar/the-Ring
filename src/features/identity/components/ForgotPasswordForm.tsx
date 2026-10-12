"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";
import { requestPasswordResetAction, verifyRecoveryCodeAction } from "../actions";
import { IdentityFormProvider, useIdentityForm } from "../context/identity-form-context";
import styles from "../identity.module.css";
import { CodeEntry } from "./CodeEntry";
import { FormFeedback } from "./FormFeedback";

type Props = {
  /** Prefilled from the login form so the member does not type it twice. */
  initialEmail?: string;
};

function ForgotPasswordFormInner({ initialEmail = "" }: Props) {
  const t = useTranslations("identity");
  const router = useRouter();
  const { submitting, startSubmit, finishSubmit, clearFeedback } = useIdentityForm();
  const [email, setEmail] = useState(initialEmail);
  const [codeSent, setCodeSent] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    startSubmit();
    const result = await requestPasswordResetAction(email);
    if (!result.ok) {
      finishSubmit({ errorCode: result.error.code });
      return;
    }
    finishSubmit({ successMessage: null });
    setCodeSent(true);
  }

  const verify = useCallback(
    (token: string) => verifyRecoveryCodeAction({ email, token }),
    [email],
  );
  const resend = useCallback(() => requestPasswordResetAction(email), [email]);
  const onVerified = useCallback(() => {
    router.push("/reset-password");
    router.refresh();
  }, [router]);

  const loginFooter = (
    <p className={styles.authSwitch}>
      <Link href="/login">{t("backToLogin")}</Link>
    </p>
  );

  if (codeSent) {
    return (
      <CodeEntry
        email={email}
        title={t("resetCodeTitle")}
        inputId="reset-code"
        verify={verify}
        resend={resend}
        onVerified={onVerified}
        onBack={() => {
          clearFeedback();
          setCodeSent(false);
        }}
        footer={loginFooter}
      />
    );
  }

  return (
    <form className={styles.authFormBody} onSubmit={onSubmit} noValidate>
      <div className={styles.authFields}>
        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor="forgot-email">
            {t("emailLabel")}
          </label>
          <input
            id="forgot-email"
            className={ui.input}
            type="email"
            autoComplete="email"
            dir="ltr"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>
      <FormFeedback />
      <button
        className={`${ui.btn} ${ui.btnPrimary} ${ui.btnBlock}`}
        type="submit"
        disabled={submitting}
      >
        {submitting ? t("submitting") : t("sendResetCode")}
      </button>
      {loginFooter}
    </form>
  );
}

function ForgotPasswordFormRoot(props: Props) {
  return (
    <IdentityFormProvider>
      <ForgotPasswordFormInner {...props} />
    </IdentityFormProvider>
  );
}

export const ForgotPasswordForm = ForgotPasswordFormRoot;
