"use client";

import Link from "next/link";
import { memo, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";
import { checkUsernameAvailabilityAction, signUpAction } from "../actions";
import { IdentityFormProvider, useIdentityForm } from "../context/identity-form-context";
import styles from "../identity.module.css";
import { MIN_PASSWORD_LENGTH } from "../password-policy";
import {
  signupFieldForError,
  usernameError as localUsernameError,
  validateSignup,
  type FieldErrors,
  type SignupField,
} from "../validation";
import { FormFeedback, useErrorMessage } from "./FormFeedback";
import { PasswordInput } from "./PasswordInput";
import { SignupCodeEntry } from "./SignupCodeEntry";

export const USERNAME_CHECK_DELAY_MS = 400;

const FIELD_ORDER: SignupField[] = ["email", "username", "password", "confirm"];

type Availability =
  | { state: "idle" }
  | { state: "checking" | "available" | "taken"; username: string };

function describedBy(...ids: (string | false | null | undefined)[]): string | undefined {
  return ids.filter(Boolean).join(" ") || undefined;
}

function SignupFormInner() {
  const t = useTranslations("identity");
  const { submitting, errorCode, startSubmit, finishSubmit, clearFeedback } =
    useIdentityForm();
  const [values, setValues] = useState({
    email: "",
    username: "",
    password: "",
    confirm: "",
    displayName: "",
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<SignupField>>({});
  const [availability, setAvailability] = useState<Availability>({ state: "idle" });
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const refs = {
    email: useRef<HTMLInputElement>(null),
    username: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
    confirm: useRef<HTMLInputElement>(null),
  };
  const checkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestUsername = useRef("");

  useEffect(
    () => () => {
      if (checkTimer.current) {
        clearTimeout(checkTimer.current);
      }
    },
    [],
  );

  const takenCode =
    availability.state === "taken" && availability.username === values.username.trim()
      ? "identity.username_taken"
      : null;
  const emailError = useErrorMessage(fieldErrors.email ?? null);
  const usernameError = useErrorMessage(fieldErrors.username ?? takenCode);
  const passwordError = useErrorMessage(fieldErrors.password ?? null);
  const confirmError = useErrorMessage(fieldErrors.confirm ?? null);

  function scheduleAvailabilityCheck(username: string) {
    if (checkTimer.current) {
      clearTimeout(checkTimer.current);
    }
    const value = username.trim();
    latestUsername.current = value;
    if (!value || localUsernameError(value)) {
      setAvailability({ state: "idle" });
      return;
    }
    setAvailability({ state: "checking", username: value });
    checkTimer.current = setTimeout(async () => {
      const result = await checkUsernameAvailabilityAction(value);
      // A slower response for an older value must not overwrite the current one.
      if (latestUsername.current !== value) {
        return;
      }
      setAvailability(
        result.ok
          ? { state: result.value ? "available" : "taken", username: value }
          : { state: "idle" },
      );
    }, USERNAME_CHECK_DELAY_MS);
  }

  function edit(field: keyof typeof values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    if (field !== "displayName" && fieldErrors[field]) {
      setFieldErrors((errors) => {
        const rest = { ...errors };
        delete rest[field];
        return rest;
      });
    }
    if (errorCode) {
      clearFeedback();
    }
    if (field === "username") {
      scheduleAvailabilityCheck(value);
    }
  }

  function showFieldErrors(errors: FieldErrors<SignupField>) {
    setFieldErrors(errors);
    const first = FIELD_ORDER.find((field) => errors[field]);
    if (first) {
      refs[first].current?.focus();
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const errors = validateSignup(values);
    if (!errors.username && takenCode) {
      errors.username = takenCode;
    }
    if (Object.keys(errors).length > 0) {
      clearFeedback();
      showFieldErrors(errors);
      return;
    }

    startSubmit();
    const result = await signUpAction({
      email: values.email,
      password: values.password,
      username: values.username,
      displayName: values.displayName || undefined,
    });
    if (!result.ok) {
      const field = signupFieldForError(result.error.code);
      if (field) {
        finishSubmit({});
        showFieldErrors({ [field]: result.error.code });
      } else {
        finishSubmit({ errorCode: result.error.code });
      }
      return;
    }
    finishSubmit({ successMessage: null });
    if (result.value.needsEmailConfirmation) {
      setAwaitingConfirm(true);
    }
  }

  if (awaitingConfirm) {
    return (
      <SignupCodeEntry
        email={values.email}
        showLoginLink
        onBack={() => {
          clearFeedback();
          setAwaitingConfirm(false);
        }}
      />
    );
  }

  const usernameStatus =
    !usernameError && availability.state === "checking"
      ? t("usernameChecking")
      : !usernameError && availability.state === "available"
        ? t("usernameAvailable", { username: availability.username })
        : null;

  return (
    <form
      className={styles.authFormBody}
      onSubmit={onSubmit}
      noValidate
      aria-busy={submitting || undefined}
    >
      <FormFeedback id="signup-feedback" />
      <div className={styles.authFields}>
        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor="signup-email">
            {t("emailLabel")}
          </label>
          <input
            ref={refs.email}
            id="signup-email"
            className={ui.input}
            type="email"
            autoComplete="email"
            dir="ltr"
            required
            autoFocus
            aria-invalid={Boolean(emailError) || undefined}
            aria-describedby={describedBy(emailError && "signup-email-error")}
            value={values.email}
            onChange={(e) => edit("email", e.target.value)}
          />
          {emailError ? (
            <span id="signup-email-error" className={ui.fieldError}>
              {emailError}
            </span>
          ) : null}
        </div>
        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor="signup-username">
            {t("usernameLabel")}
          </label>
          <div className={ui.inputPrefix} data-invalid={usernameError ? "true" : undefined}>
            <span aria-hidden>@</span>
            <input
              ref={refs.username}
              id="signup-username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              aria-invalid={Boolean(usernameError) || undefined}
              aria-describedby={describedBy(
                "signup-username-hint",
                usernameError && "signup-username-error",
                usernameStatus && "signup-username-status",
              )}
              value={values.username}
              onChange={(e) => edit("username", e.target.value)}
            />
          </div>
          <span id="signup-username-hint" className={ui.fieldHint}>
            {t("usernameHint")}
          </span>
          {usernameError ? (
            <span id="signup-username-error" className={ui.fieldError}>
              {usernameError}
            </span>
          ) : null}
          <span
            id="signup-username-status"
            className={styles.usernameStatus}
            data-state={availability.state}
            aria-live="polite"
          >
            {usernameStatus}
          </span>
        </div>
        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor="signup-password">
            {t("passwordLabel")}
          </label>
          <PasswordInput
            ref={refs.password}
            id="signup-password"
            autoComplete="new-password"
            required
            aria-invalid={Boolean(passwordError) || undefined}
            aria-describedby={describedBy(
              "signup-password-hint",
              passwordError && "signup-password-error",
            )}
            value={values.password}
            onChange={(e) => edit("password", e.target.value)}
          />
          <span id="signup-password-hint" className={ui.fieldHint}>
            {t("newPasswordHint", { min: MIN_PASSWORD_LENGTH })}
          </span>
          {passwordError ? (
            <span id="signup-password-error" className={ui.fieldError}>
              {passwordError}
            </span>
          ) : null}
        </div>
        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor="signup-confirm">
            {t("confirmSignupPasswordLabel")}
          </label>
          <PasswordInput
            ref={refs.confirm}
            id="signup-confirm"
            autoComplete="new-password"
            required
            aria-invalid={Boolean(confirmError) || undefined}
            aria-describedby={describedBy(confirmError && "signup-confirm-error")}
            value={values.confirm}
            onChange={(e) => edit("confirm", e.target.value)}
          />
          {confirmError ? (
            <span id="signup-confirm-error" className={ui.fieldError}>
              {confirmError}
            </span>
          ) : null}
        </div>
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
            value={values.displayName}
            onChange={(e) => edit("displayName", e.target.value)}
          />
          <span id="signup-display-hint" className={ui.fieldHint}>
            {t("displayNameHint")}
          </span>
        </div>
      </div>
      <button
        className={`${ui.btn} ${ui.btnPrimary} ${ui.btnBlock}`}
        type="submit"
        disabled={submitting}
        aria-busy={submitting || undefined}
      >
        {submitting ? t("submittingSignup") : t("submitSignup")}
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
