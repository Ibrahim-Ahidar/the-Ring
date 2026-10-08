"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useState } from "react";
import { useTranslations } from "next-intl";

import {
  requestPasswordResetAction,
  signInAction,
} from "../actions";
import { IdentityFormProvider, useIdentityForm } from "../context/identity-form-context";
import styles from "../identity.module.css";
import { FormFeedback } from "./FormFeedback";

function LoginFormInner() {
  const t = useTranslations("identity");
  const router = useRouter();
  const { submitting, startSubmit, finishSubmit } = useIdentityForm();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    startSubmit();
    const result = await signInAction({ email, password });
    if (!result.ok) {
      finishSubmit({ errorCode: result.error.code });
      return;
    }
    finishSubmit({ successMessage: null });
    router.push("/app");
    router.refresh();
  }

  async function onReset() {
    startSubmit();
    const result = await requestPasswordResetAction(email);
    if (!result.ok) {
      finishSubmit({ errorCode: result.error.code });
      return;
    }
    finishSubmit({ successMessage: t("resetSent") });
  }

  return (
    <form className={styles.stack} onSubmit={onSubmit} noValidate>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="login-email">
          {t("emailLabel")}
        </label>
        <input
          id="login-email"
          className={styles.input}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="login-password">
          {t("passwordLabel")}
        </label>
        <input
          id="login-password"
          className={styles.input}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <FormFeedback />
      <div className={styles.actions}>
        <button className={styles.button} type="submit" disabled={submitting}>
          {submitting ? t("submitting") : t("submitLogin")}
        </button>
        <button
          className={styles.buttonSecondary}
          type="button"
          disabled={submitting || !email.trim()}
          onClick={onReset}
        >
          {t("forgotPassword")}
        </button>
      </div>
      <p className={styles.linkRow}>
        {t("noAccount")}{" "}
        <Link href="/signup">{t("signupLink")}</Link>
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
