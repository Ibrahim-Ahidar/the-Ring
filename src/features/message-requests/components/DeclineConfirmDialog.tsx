"use client";

import { memo, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

type Props = {
  open: boolean;
  displayName: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
};

function DeclineConfirmDialogInner({
  open,
  displayName,
  onConfirm,
  onCancel,
  busy,
}: Props) {
  const t = useTranslations("message-requests");
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => previous?.focus?.();
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className={`${ui.scrim} ${ui.scrimCenter} ${ui.scrimSheet}`}
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <div
        className={ui.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="decline-request-title"
        aria-describedby="decline-request-desc"
      >
        <h2 id="decline-request-title" className={ui.dialogTitle}>
          {t("declineConfirmTitle")}
        </h2>
        <p id="decline-request-desc" className={ui.dialogText}>
          {t("declineConfirmBody", { name: displayName })}
        </p>
        <div className={ui.dialogActions}>
          <button
            ref={cancelRef}
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            onClick={onCancel}
            disabled={busy}
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnDanger}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {t("declineConfirmAction")}
          </button>
        </div>
      </div>
    </div>
  );
}

export const DeclineConfirmDialog = memo(DeclineConfirmDialogInner);
