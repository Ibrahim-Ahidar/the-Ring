"use client";

import { memo, useCallback, useState } from "react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

import { useFocusTrap } from "../hooks/useFocusTrap";

type BlockConfirmDialogProps = {
  username: string;
  displayName: string | null;
  onConfirm: () => Promise<boolean>;
  onClose: () => void;
};

export const BlockConfirmDialog = memo(function BlockConfirmDialog({
  username,
  displayName,
  onConfirm,
  onClose,
}: BlockConfirmDialogProps) {
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
        aria-labelledby="block-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="block-dialog-title" className={ui.dialogTitle}>
          {t("block.confirmTitle", { name: label })}
        </h2>
        <p className={ui.dialogText}>{t("block.confirmBody", { name: label })}</p>
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
            className={`${ui.btn} ${ui.btnDanger}`}
            onClick={handleConfirm}
            disabled={busy}
          >
            {t("block.confirmAction")}
          </button>
        </div>
      </div>
    </div>
  );
});
