"use client";

import Link from "next/link";
import { memo, useState } from "react";
import { useTranslations } from "next-intl";

import { signUpAction } from "../actions";
import { IdentityFormProvider, useIdentityForm } from "../context/identity-form-context";
import styles from "../identity.module.css";
import { FormFeedback } from "./FormFeedback";

function SignupFormInner() {
  const t = useTranslations("identity");
  const { submitting, startSubmit, finishSubmit } = useIdentityForm();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    startSubmit();
    const result = await signUpAction({
      email,
      password,
      username,
      displayName: displayName || undefined,
    });
    if (!result.ok) {
      finishSubmit({ errorCode: result.error.code });
      return;
    }
    if (result.value.needsEmailConfirmation) {
      setAwaitingConfirm(true);
      finishSubmit({ successMessage: null });
      return;
    }
    finishSubmit({ successMessage: null });
  }

  if (awaitingConfirm) {
    return (
      <div className={styles.stack}>
        <h2 className={styles.label}>{t("confirmEmailTitle")}</h2>
        <p className={styles.hint}>{t("confirmEmailBody")}</p>
        <p className={styles.linkRow}>
          <Link href="/login">{t("loginLink")}</Link>
        </p>
      </div>
    );
  }

  return (
    <form className={styles.stack} onSubmit={onSubmit} noValidate>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="signup-email">
          {t("emailLabel")}
        </label>
        <input
          id="signup-email"
          className={styles.input}
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="signup-password">
          {t("passwordLabel")}
        </label>
        <input
          id="signup-password"
          className={styles.input}
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="signup-username">
          {t("usernameLabel")}
        </label>
        <input
          id="signup-username"
          className={styles.input}
          type="text"
          autoComplete="username"
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </div>
      <div className={styles.field}>
        <label className={styles.label} htmlFor="signup-display">
          {t("displayNameLabel")}
        </label>
        <input
          id="signup-display"
          className={styles.input}
          type="text"
          autoComplete="name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <p className={styles.hint}>{t("displayNameHint")}</p>
      </div>
      <FormFeedback />
      <div className={styles.actions}>
        <button className={styles.button} type="submit" disabled={submitting}>
          {submitting ? t("submitting") : t("submitSignup")}
        </button>
      </div>
      <p className={styles.linkRow}>
        {t("hasAccount")}{" "}
        <Link href="/login">{t("loginLink")}</Link>
      </p>
    </form>
  );
}

function SignupFormRoot() {
  return (
    <IdentityFormProvider>
      <SignupFormInner />
    </IdentityFormProvider>
  );
}

export const SignupForm = memo(SignupFormRoot);
