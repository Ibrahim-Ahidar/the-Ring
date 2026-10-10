"use client";

import Link from "next/link";
import { memo, useState } from "react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";
import { signUpAction } from "../actions";
import { IdentityFormProvider, useIdentityForm } from "../context/identity-form-context";
import styles from "../identity.module.css";
import { FormFeedback, useErrorMessage } from "./FormFeedback";
import { SignupCodeEntry } from "./SignupCodeEntry";

function isUsernameError(code: string): boolean {
  return code.startsWith("identity.username_");
}

function SignupFormInner() {
  const t = useTranslations("identity");
  const { submitting, errorCode, startSubmit, finishSubmit, clearFeedback } =
    useIdentityForm();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const usernameError = useErrorMessage(
    errorCode && isUsernameError(errorCode) ? errorCode : null,
  );

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
      <SignupCodeEntry
        email={email}
        showLoginLink
        onBack={() => {
          clearFeedback();
          setAwaitingConfirm(false);
        }}
      />
    );
  }

  return (
    <form className={styles.authFormBody} onSubmit={onSubmit} noValidate>
      <div className={styles.authFields}>
        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor="signup-display">
            {t("displayNameLabel")}
          </label>
          <input
            id="signup-display"
            className={ui.input}
            type="text"
            autoComplete="name"
            aria-describedby="signup-display-hint"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <span id="signup-display-hint" className={ui.fieldHint}>
            {t("displayNameHint")}
          </span>
        </div>
        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor="signup-username">
            {t("usernameLabel")}
          </label>
          <div className={ui.inputPrefix} data-invalid={usernameError ? "true" : undefined}>
            <span aria-hidden>@</span>
            <input
              id="signup-username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              aria-invalid={usernameError ? true : undefined}
              aria-describedby={
                usernameError ? "signup-username-error" : "signup-username-hint"
              }
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          {usernameError ? (
            <span id="signup-username-error" className={ui.fieldError} role="alert">
              {usernameError}
            </span>
          ) : (
            <span id="signup-username-hint" className={ui.fieldHint}>
              {t("usernameHint")}
            </span>
          )}
        </div>
        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor="signup-email">
            {t("emailLabel")}
          </label>
          <input
            id="signup-email"
            className={ui.input}
            type="email"
            autoComplete="email"
            dir="ltr"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor="signup-password">
            {t("passwordLabel")}
          </label>
          <input
            id="signup-password"
            className={ui.input}
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      </div>
      <FormFeedback exclude={isUsernameError} />
      <button
        className={`${ui.btn} ${ui.btnPrimary} ${ui.btnBlock}`}
        type="submit"
        disabled={submitting}
      >
        {submitting ? t("submitting") : t("submitSignup")}
      </button>
      <p className={styles.authSwitch}>
        {t("hasAccount")} <Link href="/login">{t("loginLink")}</Link>
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
