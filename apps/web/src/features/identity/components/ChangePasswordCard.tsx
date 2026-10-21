"use client";

import { useRouter } from "next/navigation";
import { memo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";
import { changePasswordAction } from "../actions";
import { IdentityFormProvider, useIdentityForm } from "../context/identity-form-context";
import styles from "../identity.module.css";
import { MIN_PASSWORD_LENGTH } from "../password-policy";
import { newPasswordError } from "../validation";
import { FormFeedback, useErrorMessage } from "./FormFeedback";
import { announcePasswordUpdated } from "./PasswordUpdatedToast";
import { PasswordInput } from "./PasswordInput";

type Field = "current" | "next" | "confirm";

const FIELD_FOR_CODE: Record<string, Field> = {
  "identity.current_password_wrong": "current",
  "identity.password_required": "current",
  "identity.password_weak": "next",
  "identity.password_same": "next",
  "identity.password_mismatch": "confirm",
};

function ChangePasswordCardInner() {
  const t = useTranslations("identity");
  const router = useRouter();
  const { submitting, startSubmit, finishSubmit, clearFeedback, errorCode } = useIdentityForm();
  const [values, setValues] = useState({ current: "", next: "", confirm: "" });
  const [signOutOthers, setSignOutOthers] = useState(true);
  const [fieldError, setFieldError] = useState<{ field: Field; code: string } | null>(null);
  const refs = {
    current: useRef<HTMLInputElement>(null),
    next: useRef<HTMLInputElement>(null),
    confirm: useRef<HTMLInputElement>(null),
  };
  const message = useErrorMessage(fieldError?.code ?? null);

  function edit(field: Field, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    if (fieldError?.field === field) {
      setFieldError(null);
    }
    if (errorCode) {
      clearFeedback();
    }
  }

  function showFieldError(field: Field, code: string) {
    setFieldError({ field, code });
    refs[field].current?.focus();
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    clearFeedback();
    if (!values.current) {
      showFieldError("current", "identity.password_required");
      return;
    }
    const weak = newPasswordError(values.next);
    if (weak) {
      showFieldError("next", weak);
      return;
    }
    if (values.next !== values.confirm) {
      showFieldError("confirm", "identity.password_mismatch");
      return;
    }

    startSubmit();
    const result = await changePasswordAction({
      currentPassword: values.current,
      newPassword: values.next,
      signOutOthers,
    });
    if (!result.ok) {
      const field = FIELD_FOR_CODE[result.error.code];
      if (field) {
        finishSubmit({});
        showFieldError(field, result.error.code);
      } else {
        finishSubmit({ errorCode: result.error.code });
      }
      return;
    }
    setValues({ current: "", next: "", confirm: "" });
    finishSubmit({});
    // The shell toast survives the page re-render the new session cookies trigger.
    announcePasswordUpdated();
    router.refresh();
  }

  function errorFor(field: Field) {
    return fieldError?.field === field ? message : null;
  }

  function fieldProps(field: Field) {
    const error = errorFor(field);
    return {
      ref: refs[field],
      value: values[field],
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => edit(field, e.target.value),
      "aria-invalid": Boolean(error) || undefined,
    };
  }

  return (
    <form
      className={ui.settingsCard}
      onSubmit={onSubmit}
      noValidate
      aria-labelledby="password-heading"
      aria-busy={submitting || undefined}
    >
      <div className={ui.settingsCardHead}>
        <h2 id="password-heading" className={ui.settingsCardTitle}>
          {t("passwordTitle")}
        </h2>
        <p className={ui.settingsCardDesc}>{t("passwordHint")}</p>
      </div>
      <div className={ui.settingsCardBody}>
        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor="change-password-current">
            {t("currentPasswordLabel")}
          </label>
          <PasswordInput
            id="change-password-current"
            autoComplete="current-password"
            aria-describedby={errorFor("current") ? "change-password-current-error" : undefined}
            {...fieldProps("current")}
          />
          {errorFor("current") ? (
            <span id="change-password-current-error" className={ui.fieldError}>
              {errorFor("current")}
            </span>
          ) : null}
        </div>
        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor="change-password-next">
            {t("newPasswordLabel")}
          </label>
          <PasswordInput
            id="change-password-next"
            autoComplete="new-password"
            aria-describedby={
              errorFor("next")
                ? "change-password-next-hint change-password-next-error"
                : "change-password-next-hint"
            }
            {...fieldProps("next")}
          />
          <span id="change-password-next-hint" className={ui.fieldHint}>
            {t("newPasswordHint", { min: MIN_PASSWORD_LENGTH })}
          </span>
          {errorFor("next") ? (
            <span id="change-password-next-error" className={ui.fieldError}>
              {errorFor("next")}
            </span>
          ) : null}
        </div>
        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor="change-password-confirm">
            {t("confirmPasswordLabel")}
          </label>
          <PasswordInput
            id="change-password-confirm"
            autoComplete="new-password"
            aria-describedby={errorFor("confirm") ? "change-password-confirm-error" : undefined}
            {...fieldProps("confirm")}
          />
          {errorFor("confirm") ? (
            <span id="change-password-confirm-error" className={ui.fieldError}>
              {errorFor("confirm")}
            </span>
          ) : null}
        </div>
        <label className={styles.checkRow}>
          <input
            type="checkbox"
            checked={signOutOthers}
            onChange={(e) => setSignOutOthers(e.target.checked)}
          />
          {t("signOutOthersOnChange")}
        </label>
        <div className={styles.cardFoot}>
          <button
            className={`${ui.btn} ${ui.btnSecondary}`}
            type="submit"
            disabled={submitting}
            aria-busy={submitting || undefined}
          >
            {submitting ? t("submitting") : t("changePasswordSubmit")}
          </button>
        </div>
        <FormFeedback />
      </div>
    </form>
  );
}

function ChangePasswordCardRoot() {
  return (
    <IdentityFormProvider>
      <ChangePasswordCardInner />
    </IdentityFormProvider>
  );
}

export const ChangePasswordCard = memo(ChangePasswordCardRoot);
