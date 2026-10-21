"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";
import { signOutAction, verifySignInMfaAction } from "../actions";
import { IdentityFormProvider, useIdentityForm } from "../context/identity-form-context";
import { useHydrated } from "../hooks/useHydrated";
import styles from "../identity.module.css";
import { normalizeCode, CODE_LENGTH } from "./CodeEntry";
import { FormFeedback } from "./FormFeedback";

const FEEDBACK_ID = "mfa-verify-feedback";

function MfaVerifyFormInner({ next = "/app" }: { next?: string }) {
  const t = useTranslations("identity");
  const router = useRouter();
  const hydrated = useHydrated();
  const { submitting, errorCode, startSubmit, finishSubmit, clearFeedback } =
    useIdentityForm();
  const [code, setCode] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (code.length !== CODE_LENGTH) {
      finishSubmit({ errorCode: "identity.mfa_code_invalid" });
      inputRef.current?.focus();
      return;
    }
    startSubmit();
    const result = await verifySignInMfaAction(code).catch(() => null);
    if (!result?.ok) {
      finishSubmit({ errorCode: result?.error.code ?? "platform.unexpected" });
      setCode("");
      inputRef.current?.focus();
      return;
    }
    finishSubmit({ successMessage: null });
    router.push(next);
    router.refresh();
  }

  async function cancel() {
    startSubmit();
    await signOutAction().catch(() => null);
    finishSubmit({ successMessage: null });
    router.push("/login");
    router.refresh();
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
          <label className={ui.fieldLabel} htmlFor="mfa-code">
            {t("mfaCodeLabel")}
          </label>
          <input
            ref={inputRef}
            id="mfa-code"
            className={ui.input}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={CODE_LENGTH}
            dir="ltr"
            autoFocus
            aria-invalid={Boolean(errorCode) || undefined}
            aria-describedby={errorCode ? FEEDBACK_ID : undefined}
            value={code}
            onChange={(e) => {
              setCode(normalizeCode(e.target.value));
              if (errorCode) {
                clearFeedback();
              }
            }}
          />
        </div>
        <p className={ui.settingDesc}>{t("mfaLostHint")}</p>
      </div>
      <button
        className={`${ui.btn} ${ui.btnPrimary} ${ui.btnBlock}`}
        type="submit"
        disabled={!hydrated || submitting}
        aria-busy={submitting || undefined}
      >
        {submitting ? t("mfaVerifying") : t("mfaVerifySubmit")}
      </button>
      <button
        type="button"
        className={`${ui.btn} ${ui.btnSecondary} ${ui.btnBlock}`}
        disabled={submitting}
        onClick={cancel}
      >
        {t("mfaUseAnotherAccount")}
      </button>
    </form>
  );
}

export function MfaVerifyForm(props: { next?: string }) {
  return (
    <IdentityFormProvider>
      <MfaVerifyFormInner {...props} />
    </IdentityFormProvider>
  );
}
