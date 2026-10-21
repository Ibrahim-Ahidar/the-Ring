"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";
import {
  cancelTotpEnrollmentAction,
  enrollTotpAction,
  removeTotpFactorAction,
  verifyTotpEnrollmentAction,
} from "../actions";
import { IdentityFormProvider, useIdentityForm } from "../context/identity-form-context";
import type { MfaEnrollment, MfaFactor } from "../service";
import { CODE_LENGTH, normalizeCode } from "./CodeEntry";
import { FormFeedback } from "./FormFeedback";

type Props = { factors: MfaFactor[]; maxFactors: number };

type Step =
  | { kind: "idle" }
  | { kind: "enroll"; enrollment: MfaEnrollment }
  | { kind: "remove"; factor: MfaFactor };

function CodeField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("identity");
  const { errorCode, clearFeedback } = useIdentityForm();
  return (
    <div className={ui.field}>
      <label className={ui.fieldLabel} htmlFor={id}>
        {t("mfaCodeLabel")}
      </label>
      <input
        id={id}
        className={ui.input}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={CODE_LENGTH}
        dir="ltr"
        autoFocus
        aria-invalid={Boolean(errorCode) || undefined}
        value={value}
        onChange={(e) => {
          onChange(normalizeCode(e.target.value));
          if (errorCode) {
            clearFeedback();
          }
        }}
      />
    </div>
  );
}

function TwoFactorCardInner({ factors, maxFactors }: Props) {
  const t = useTranslations("identity");
  const router = useRouter();
  const { submitting, startSubmit, finishSubmit, clearFeedback } = useIdentityForm();
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const canAdd = factors.length < maxFactors;

  function reset() {
    setStep({ kind: "idle" });
    setCode("");
    setCopied(false);
    clearFeedback();
  }

  async function begin() {
    startSubmit();
    const name = `${t("mfaDefaultName")} ${factors.length + 1}`;
    const result = await enrollTotpAction(name).catch(() => null);
    if (!result?.ok) {
      finishSubmit({ errorCode: result?.error.code ?? "platform.unexpected" });
      return;
    }
    finishSubmit({ successMessage: null });
    setStep({ kind: "enroll", enrollment: result.value });
  }

  async function cancelEnroll(enrollment: MfaEnrollment) {
    await cancelTotpEnrollmentAction(enrollment.factorId).catch(() => null);
    reset();
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    if (step.kind === "idle") {
      return;
    }
    startSubmit();
    const result =
      step.kind === "enroll"
        ? await verifyTotpEnrollmentAction(step.enrollment.factorId, code).catch(() => null)
        : await removeTotpFactorAction(step.factor.id, code).catch(() => null);
    if (!result?.ok) {
      finishSubmit({ errorCode: result?.error.code ?? "platform.unexpected" });
      setCode("");
      return;
    }
    const wasEnroll = step.kind === "enroll";
    const hadOne = factors.length === 1;
    reset();
    finishSubmit({
      successMessage: wasEnroll
        ? hadOne
          ? t("mfaEnabledSecond")
          : t("mfaEnabled")
        : t("mfaRemoved"),
    });
    router.refresh();
  }

  async function copySecret(secret: string) {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className={ui.settingsCard} aria-labelledby="mfa-heading">
      <div className={ui.settingsCardHead}>
        <h2 id="mfa-heading" className={ui.settingsCardTitle}>
          {t("mfaTitle")}
        </h2>
        <p className={ui.settingsCardDesc}>{t("mfaHint")}</p>
      </div>

      {factors.length > 0 ? (
        <ul>
          {factors.map((factor) => (
            <li key={factor.id} className={ui.setting}>
              <span className={ui.settingBody}>
                <span dir="auto">{factor.friendlyName || t("mfaDefaultName")}</span>
              </span>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSm}`}
                disabled={submitting}
                onClick={() => {
                  clearFeedback();
                  setCode("");
                  setStep({ kind: "remove", factor });
                }}
              >
                {t("mfaRemove")}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {step.kind === "enroll" ? (
        <form onSubmit={confirm} noValidate aria-busy={submitting || undefined}>
          <p className={ui.settingDesc}>{t("mfaScan")}</p>
          <div dir="ltr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={step.enrollment.qrCode} alt={t("mfaQrAlt")} width={180} height={180} />
            <p>
              <span className={ui.fieldLabel}>{t("mfaSecretLabel")}</span>{" "}
              <code>{step.enrollment.secret}</code>{" "}
              <button
                type="button"
                className={`${ui.btn} ${ui.btnSecondary} ${ui.btnSm}`}
                onClick={() => copySecret(step.enrollment.secret)}
              >
                {copied ? t("mfaCopied") : t("mfaCopy")}
              </button>
            </p>
          </div>
          <CodeField id="mfa-enroll-code" value={code} onChange={setCode} />
          <button
            type="submit"
            className={`${ui.btn} ${ui.btnPrimary}`}
            disabled={submitting || code.length !== CODE_LENGTH}
          >
            {t("mfaConfirm")}
          </button>{" "}
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            disabled={submitting}
            onClick={() => cancelEnroll(step.enrollment)}
          >
            {t("mfaCancel")}
          </button>
        </form>
      ) : null}

      {step.kind === "remove" ? (
        <form onSubmit={confirm} noValidate aria-busy={submitting || undefined}>
          <p className={ui.settingDesc}>{t("mfaRemovePrompt")}</p>
          <CodeField id="mfa-remove-code" value={code} onChange={setCode} />
          <button
            type="submit"
            className={`${ui.btn} ${ui.btnDanger}`}
            disabled={submitting || code.length !== CODE_LENGTH}
          >
            {t("mfaRemoveConfirm")}
          </button>{" "}
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            disabled={submitting}
            onClick={reset}
          >
            {t("mfaCancel")}
          </button>
        </form>
      ) : null}

      <FormFeedback />

      {step.kind === "idle" && canAdd ? (
        <div>
          {factors.length === 1 ? <p className={ui.settingDesc}>{t("mfaBackupPrompt")}</p> : null}
          <button
            type="button"
            className={`${ui.btn} ${ui.btnPrimary}`}
            disabled={submitting}
            onClick={begin}
          >
            {factors.length === 0 ? t("mfaEnable") : t("mfaAddBackup")}
          </button>
        </div>
      ) : null}

      {factors.length > 0 ? <p className={ui.settingDesc}>{t("mfaLostHint")}</p> : null}
    </section>
  );
}

export function TwoFactorCard(props: Props) {
  return (
    <IdentityFormProvider>
      <TwoFactorCardInner {...props} />
    </IdentityFormProvider>
  );
}
