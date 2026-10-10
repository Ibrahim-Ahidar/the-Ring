"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useState } from "react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";
import { signInAction } from "../actions";
import { IdentityFormProvider, useIdentityForm } from "../context/identity-form-context";
import styles from "../identity.module.css";
import { FormFeedback } from "./FormFeedback";
import { SignupCodeEntry } from "./SignupCodeEntry";

function LoginFormInner() {
  const t = useTranslations("identity");
  const router = useRouter();
  const { submitting, errorCode, startSubmit, finishSubmit, clearFeedback } =
    useIdentityForm();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirming, setConfirming] = useState(false);
  const rejected = errorCode === "identity.credentials_rejected";

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    startSubmit();
    const result = await signInAction({ email, password });
    if (!result.ok) {
      // An unconfirmed account goes to the code screen, which sends a fresh code.
      if (result.error.code === "identity.confirmation_required") {
        finishSubmit({ successMessage: null });
        setConfirming(true);
        return;
      }
      finishSubmit({ errorCode: result.error.code });
      return;
    }
    finishSubmit({ successMessage: null });
    router.push("/app");
    router.refresh();
  }

  if (confirming) {
    return (
      <SignupCodeEntry
        email={email}
        intro={t("errors.identity.confirmation_required")}
        resendOnMount
        onBack={() => {
          clearFeedback();
          setConfirming(false);
        }}
      />
    );
  }

  return (
    <form className={styles.authFormBody} onSubmit={onSubmit} noValidate>
      <div className={styles.authFields}>
        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor="login-email">
            {t("emailLabel")}
          </label>
          <input
            id="login-email"
            className={ui.input}
            type="email"
            autoComplete="email"
            dir="ltr"
            required
            aria-invalid={rejected || undefined}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor="login-password">
            {t("passwordLabel")}
          </label>
          <input
            id="login-password"
            className={ui.input}
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={rejected || undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className={styles.authRow}>
          <Link
            href={
              email.trim()
                ? `/forgot-password?email=${encodeURIComponent(email.trim())}`
                : "/forgot-password"
            }
          >
            {t("forgotPasswordLink")}
          </Link>
        </div>
      </div>
      <FormFeedback />
      <button
        className={`${ui.btn} ${ui.btnPrimary} ${ui.btnBlock}`}
        type="submit"
        disabled={submitting}
      >
        {submitting ? t("submitting") : t("submitLogin")}
      </button>
      <p className={styles.authSwitch}>
        {t("noAccount")} <Link href="/signup">{t("signupLink")}</Link>
      </p>
    </form>
  );
}

function LoginFormRoot() {
  return (
    <IdentityFormProvider>
      <LoginFormInner />
    </IdentityFormProvider>
  );
}

export const LoginForm = memo(LoginFormRoot);
