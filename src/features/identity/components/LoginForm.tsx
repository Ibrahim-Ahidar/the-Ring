"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";
import { signInAction } from "../actions";
import { IdentityFormProvider, useIdentityForm } from "../context/identity-form-context";
import styles from "../identity.module.css";
import { validateLogin, type FieldErrors, type LoginField } from "../validation";
import { FormFeedback, useErrorMessage } from "./FormFeedback";
import { PasswordInput } from "./PasswordInput";
import { SignupCodeEntry } from "./SignupCodeEntry";

const FEEDBACK_ID = "login-feedback";

function describedBy(...ids: (string | false | null | undefined)[]): string | undefined {
  return ids.filter(Boolean).join(" ") || undefined;
}

type Props = {
  /** Where to go after sign-in; the page has already checked it with `safeNextPath`. */
  next?: string;
};

function LoginFormInner({ next = "/app" }: Props) {
  const t = useTranslations("identity");
  const router = useRouter();
  const { submitting, errorCode, startSubmit, finishSubmit, clearFeedback } =
    useIdentityForm();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<LoginField>>({});
  const [confirming, setConfirming] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const rejected = errorCode === "identity.credentials_rejected";
  const emailError = useErrorMessage(fieldErrors.email ?? null);
  const passwordError = useErrorMessage(fieldErrors.password ?? null);

  function edit(field: LoginField, value: string) {
    if (field === "email") {
      setEmail(value);
    } else {
      setPassword(value);
    }
    if (fieldErrors[field]) {
      setFieldErrors((errors) => {
        const rest = { ...errors };
        delete rest[field];
        return rest;
      });
    }
    if (errorCode) {
      clearFeedback();
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const errors = validateLogin({ email, password });
    setFieldErrors(errors);
    if (errors.email || errors.password) {
      clearFeedback();
      (errors.email ? emailRef : passwordRef).current?.focus();
      return;
    }

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
      if (result.error.code === "identity.credentials_rejected") {
        passwordRef.current?.focus();
      }
      return;
    }
    finishSubmit({ successMessage: null });
    router.push(next);
    router.refresh();
  }

  if (confirming) {
    return (
      <SignupCodeEntry
        email={email}
        intro={t("errors.identity.confirmation_required")}
        resendOnMount
        next={next}
        onBack={() => {
          clearFeedback();
          setConfirming(false);
        }}
      />
    );
  }

  return (
    <form
      className={styles.authFormBody}
      onSubmit={onSubmit}
      noValidate
      aria-busy={submitting || undefined}
    >
      <FormFeedback id={FEEDBACK_ID} />
      <div className={styles.authFields}>
        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor="login-email">
            {t("emailLabel")}
          </label>
          <input
            ref={emailRef}
            id="login-email"
            className={ui.input}
            type="email"
            autoComplete="email"
            dir="ltr"
            required
            autoFocus
            aria-invalid={Boolean(emailError) || rejected || undefined}
            aria-describedby={describedBy(emailError && "login-email-error", rejected && FEEDBACK_ID)}
            value={email}
            onChange={(e) => edit("email", e.target.value)}
          />
          {emailError ? (
            <span id="login-email-error" className={ui.fieldError}>
              {emailError}
            </span>
          ) : null}
        </div>
        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor="login-password">
            {t("passwordLabel")}
          </label>
          <PasswordInput
            ref={passwordRef}
            id="login-password"
            autoComplete="current-password"
            required
            aria-invalid={Boolean(passwordError) || rejected || undefined}
            aria-describedby={describedBy(
              passwordError && "login-password-error",
              rejected && FEEDBACK_ID,
            )}
            value={password}
            onChange={(e) => edit("password", e.target.value)}
          />
          {passwordError ? (
            <span id="login-password-error" className={ui.fieldError}>
              {passwordError}
            </span>
          ) : null}
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
      <button
        className={`${ui.btn} ${ui.btnPrimary} ${ui.btnBlock}`}
        type="submit"
        disabled={submitting}
        aria-busy={submitting || undefined}
      >
        {submitting ? t("submittingLogin") : t("submitLogin")}
      </button>
      <p className={styles.authSwitch}>
        {t("noAccount")} <Link href="/signup">{t("signupLink")}</Link>
      </p>
    </form>
  );
}

function LoginFormRoot(props: Props) {
  return (
    <IdentityFormProvider>
      <LoginFormInner {...props} />
    </IdentityFormProvider>
  );
}

export const LoginForm = LoginFormRoot;
