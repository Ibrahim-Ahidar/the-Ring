"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";
import { resendConfirmationAction, verifySignupCodeAction } from "../actions";
import { useIdentityForm } from "../context/identity-form-context";
import styles from "../identity.module.css";
import { FormFeedback } from "./FormFeedback";

export const CODE_LENGTH = 6;
export const RESEND_COOLDOWN_SECONDS = 60;
export const MAX_WRONG_CODES = 5;

const WRONG_CODE_ERRORS = new Set(["identity.code_invalid", "identity.code_expired"]);

/** Keeps ASCII digits only; Arabic-Indic and Persian digits are converted, not dropped. */
export function normalizeCode(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, "")
    .slice(0, CODE_LENGTH);
}

type Props = {
  email: string;
  onBack: () => void;
  /** Shown above the code field, e.g. why login sent the member here. */
  intro?: string;
  /** Login reaches this screen without a fresh email, so it asks for one first. */
  resendOnMount?: boolean;
  showLoginLink?: boolean;
};

function SignupCodeEntryInner({
  email,
  onBack,
  intro,
  resendOnMount = false,
  showLoginLink = false,
}: Props) {
  const t = useTranslations("identity");
  const router = useRouter();
  const { submitting, errorCode, startSubmit, finishSubmit } = useIdentityForm();
  const [code, setCode] = useState("");
  const [wrongCodes, setWrongCodes] = useState(0);
  const [cooldown, setCooldown] = useState(resendOnMount ? 0 : RESEND_COOLDOWN_SECONDS);
  const resentOnMount = useRef(false);
  const exhausted = wrongCodes >= MAX_WRONG_CODES;

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const resend = useCallback(async () => {
    startSubmit();
    const result = await resendConfirmationAction(email);
    if (!result.ok) {
      finishSubmit({ errorCode: result.error.code });
      return;
    }
    setWrongCodes(0);
    setCode("");
    setCooldown(RESEND_COOLDOWN_SECONDS);
    finishSubmit({ successMessage: t("codeResent") });
  }, [email, finishSubmit, startSubmit, t]);

  useEffect(() => {
    if (resendOnMount && !resentOnMount.current) {
      resentOnMount.current = true;
      void resend();
    }
  }, [resend, resendOnMount]);

  async function verify(token: string) {
    startSubmit();
    const result = await verifySignupCodeAction({ email, token });
    if (!result.ok) {
      const code = result.error.code;
      if (WRONG_CODE_ERRORS.has(code)) {
        const next = wrongCodes + 1;
        setWrongCodes(next);
        setCode("");
        finishSubmit({
          errorCode: next >= MAX_WRONG_CODES ? "identity.code_attempts_exhausted" : code,
        });
        return;
      }
      finishSubmit({ errorCode: code });
      return;
    }
    finishSubmit({ successMessage: null });
    router.push("/app");
    router.refresh();
  }

  function onChange(value: string) {
    const next = normalizeCode(value);
    setCode(next);
    if (next.length === CODE_LENGTH && !submitting && !exhausted) {
      void verify(next);
    }
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!submitting && !exhausted) {
      void verify(code);
    }
  }

  const invalid = Boolean(errorCode && errorCode.startsWith("identity.code_"));

  return (
    <form className={styles.authFormBody} onSubmit={onSubmit} noValidate>
      <div className={styles.authNotice}>
        <h2 className={styles.authNoticeTitle}>{t("confirmEmailTitle")}</h2>
        {intro ? <p>{intro}</p> : null}
        <p>
          {t.rich("codeSentBody", {
            email,
            addr: (chunks) => <bdi dir="ltr">{chunks}</bdi>,
          })}
        </p>
      </div>
      <div className={styles.authFields}>
        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor="signup-code">
            {t("codeLabel")}
          </label>
          <input
            id="signup-code"
            className={`${ui.input} ${styles.codeInput}`}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            // No maxLength: the browser would truncate a pasted "123 456" before normalizeCode.
            pattern="[0-9]*"
            dir="ltr"
            required
            disabled={exhausted}
            aria-invalid={invalid || undefined}
            aria-describedby="signup-code-hint"
            value={code}
            onChange={(e) => onChange(e.target.value)}
          />
          <span id="signup-code-hint" className={ui.fieldHint}>
            {t("codeHint")}
          </span>
        </div>
        <div className={styles.authRow}>
          <button
            className={ui.linkBtn}
            type="button"
            disabled={submitting || cooldown > 0}
            onClick={() => void resend()}
          >
            {cooldown > 0 ? t("resendCodeIn", { seconds: cooldown }) : t("resendCode")}
          </button>
        </div>
      </div>
      <FormFeedback />
      <button
        className={`${ui.btn} ${ui.btnPrimary} ${ui.btnBlock}`}
        type="submit"
        disabled={submitting || exhausted || code.length !== CODE_LENGTH}
      >
        {submitting ? t("submitting") : t("submitCode")}
      </button>
      <p className={styles.authSwitch}>
        <button className={ui.linkBtn} type="button" onClick={onBack}>
          {t("changeEmail")}
        </button>
      </p>
      {showLoginLink ? (
        <p className={styles.authSwitch}>
          {t("hasAccount")} <Link href="/login">{t("loginLink")}</Link>
        </p>
      ) : null}
    </form>
  );
}

export const SignupCodeEntry = memo(SignupCodeEntryInner);
