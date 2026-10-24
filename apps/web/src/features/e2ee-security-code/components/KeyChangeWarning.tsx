"use client";

import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

type Props = { name: string; onSend: () => void; onCancel: () => void };

/** Shown before sending when a verified contact's security code changed. */
export function KeyChangeWarning({ name, onSend, onCancel }: Props) {
  const t = useTranslations("e2ee-security-code");
  return (
    <div className={`${ui.scrim} ${ui.scrimCenter}`} role="presentation">
      <div
        className={ui.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="key-change-title"
        aria-describedby="key-change-body"
      >
        <h2 id="key-change-title" className={ui.dialogTitle}>
          {t("warnTitle", { name })}
        </h2>
        <p id="key-change-body" className={ui.dialogText}>
          {t("warnBody", { name })}
        </p>
        <div className={ui.dialogActions}>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={onCancel}>
            {t("warnCancel")}
          </button>
          <button type="button" className={`${ui.btn} ${ui.btnDanger}`} onClick={onSend}>
            {t("warnSend")}
          </button>
        </div>
      </div>
    </div>
  );
}
