"use client";

import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import type { Result } from "@pulse/core/result";
import ui from "@/shell/styles/ui.module.css";
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

export type CodeEntryProps = {
  email: string;
  title: string;
  /** Prefix for the input and hint ids, so two flows never share an id. */
  inputId: string;
  verify: (token: string) => Promise<Result<void>>;
  resend: () => Promise<Result<void>>;
  onVerified: () => void;
  onBack: () => void;
  /** Shown above the code field, e.g. why login sent the member here. */
  intro?: string;
  /** Callers that reach this screen without a fresh email ask for one first. */
  resendOnMount?: boolean;
  footer?: ReactNode;
};

/** 6-digit email code entry shared by signup confirmation and password recovery. */
function CodeEntryInner({
  email,
  title,
  inputId,
  verify: verifyToken,
  resend: resendCode,
  onVerified,
  onBack,
  intro,
  resendOnMount = false,
  footer,
}: CodeEntryProps) {
  const t = useTranslations("identity");
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
    const result = await resendCode();
    if (!result.ok) {
      finishSubmit({ errorCode: result.error.code });
      return;
    }
    setWrongCodes(0);
    setCode("");
    setCooldown(RESEND_COOLDOWN_SECONDS);
    finishSubmit({ successMessage: t("codeResent") });
  }, [finishSubmit, resendCode, startSubmit, t]);

  useEffect(() => {
    if (resendOnMount && !resentOnMount.current) {
      resentOnMount.current = true;
      void resend();
    }
  }, [resend, resendOnMount]);

  async function verify(token: string) {
    startSubmit();
    const result = await verifyToken(token);
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
    onVerified();
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
  const hintId = `${inputId}-hint`;

  return (
    <form className={styles.authFormBody} onSubmit={onSubmit} noValidate>
      <div className={styles.authNotice}>
        <h2 className={styles.authNoticeTitle}>{title}</h2>
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
          <label className={ui.fieldLabel} htmlFor={inputId}>
            {t("codeLabel")}
          </label>
          <input
            id={inputId}
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
            aria-describedby={hintId}
            value={code}
            onChange={(e) => onChange(e.target.value)}
          />
          <span id={hintId} className={ui.fieldHint}>
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
      {footer}
    </form>
  );
}

export const CodeEntry = memo(CodeEntryInner);
