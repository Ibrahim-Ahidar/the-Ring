"use client";

import { memo, useCallback, useState } from "react";
import { useTranslations } from "next-intl";

import { useFocusTrap } from "../hooks/useFocusTrap";
import styles from "./PrivacySettings.module.css";

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
    <div className={styles.modalBackdrop} onClick={onClose} role="presentation">
      <div
        ref={trapRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="block-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="block-dialog-title" className={styles.modalTitle}>
          {t("block.confirmTitle", { name: label })}
        </h2>
        <p className={styles.rowLabel}>{t("block.confirmBody", { name: label })}</p>
        {error ? <p className={styles.errorBanner}>{error}</p> : null}
        <div className={styles.modalActions}>
          <button type="button" className={styles.button} onClick={onClose} disabled={busy}>
            {t("actions.cancel")}
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonDanger}`}
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
