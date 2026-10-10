"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

import { useFocusTrap } from "../hooks/useFocusTrap";

type SessionConfirmDialogProps = {
  title: string;
  body: string;
  onConfirm: () => void;
  onClose: () => void;
};

export const SessionConfirmDialog = memo(function SessionConfirmDialog({
  title,
  body,
  onConfirm,
  onClose,
}: SessionConfirmDialogProps) {
  const t = useTranslations("identity");
  const trapRef = useFocusTrap(true);

  return (
    <div
      className={`${ui.scrim} ${ui.scrimCenter} ${ui.scrimSheet}`}
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
      role="presentation"
    >
      <div
        ref={trapRef}
        className={ui.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-dialog-title"
        aria-describedby="session-dialog-body"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="session-dialog-title" className={ui.dialogTitle}>
          {title}
        </h2>
        <p id="session-dialog-body" className={ui.dialogText}>
          {body}
        </p>
        <div className={ui.dialogActions}>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            onClick={onClose}
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnDanger}`}
            onClick={onConfirm}
          >
            {t("signOut")}
          </button>
        </div>
      </div>
    </div>
  );
});
