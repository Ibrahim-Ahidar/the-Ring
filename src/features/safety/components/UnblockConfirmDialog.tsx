"use client";

import { memo, useCallback, useState } from "react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

import { useFocusTrap } from "../hooks/useFocusTrap";

type UnblockConfirmDialogProps = {
  username: string;
  displayName: string | null;
  onConfirm: () => Promise<boolean>;
  onClose: () => void;
};

export const UnblockConfirmDialog = memo(function UnblockConfirmDialog({
  username,
  displayName,
  onConfirm,
  onClose,
}: UnblockConfirmDialogProps) {
  const t = useTranslations("safety");
  const trapRef = useFocusTrap(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = useCallback(async () => {
    setBusy(true);
    setError(null);
    const ok = await onConfirm();
    setBusy(false);
    if (ok) {
      onClose();
    } else {
      setError(t("errors.generic"));
    }
  }, [onConfirm, onClose, t]);

  const label = displayName?.trim() || username;

  return (
    <div
      className={`${ui.scrim} ${ui.scrimCenter} ${ui.scrimSheet}`}
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !busy) {
          event.stopPropagation();
          onClose();
        }
      }}
      role="presentation"
    >
      <div
        ref={trapRef}
        className={ui.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="unblock-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="unblock-dialog-title" className={ui.dialogTitle}>
          {t("block.unblockTitle", { name: label })}
        </h2>
        <p className={ui.dialogText}>{t("block.unblockBody", { name: label })}</p>
        {error ? (
          <p className={ui.errorText} role="alert">
            {error}
          </p>
        ) : null}
        <div className={ui.dialogActions}>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            onClick={onClose}
            disabled={busy}
          >
            {t("actions.cancel")}
          </button>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnPrimary}`}
            onClick={handleConfirm}
            disabled={busy}
          >
            {t("block.unblockConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
});
