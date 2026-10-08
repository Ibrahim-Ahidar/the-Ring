"use client";

import { memo, useCallback, useState } from "react";
import { useTranslations } from "next-intl";

import { createFolderAction, renameFolderAction } from "../actions";
import { organizationErrorMessage } from "../error-message";
import type { FolderDialogMode } from "../organization-events";
import { useFocusTrap } from "../hooks/useFocusTrap";
import styles from "../conversation-organization.module.css";

type Props = {
  mode: FolderDialogMode;
  onClose: () => void;
  onSaved: () => void;
};

export const FolderNameDialog = memo(function FolderNameDialog({
  mode,
  onClose,
  onSaved,
}: Props) {
  const t = useTranslations("conversation-organization");
  const trapRef = useFocusTrap(true);
  const initial =
    mode.kind === "rename" ? mode.currentName : "";
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    setBusy(true);
    setError(null);
    const trimmed = name.trim();
    const result =
      mode.kind === "create"
        ? await createFolderAction(trimmed)
        : await renameFolderAction({ folderId: mode.folderId, name: trimmed });
    setBusy(false);
    if (!result.ok) {
      setError(organizationErrorMessage(t, result.error.code));
      return;
    }
    onSaved();
    onClose();
  }, [mode, name, onClose, onSaved, t]);

  return (
    <>
      <div className={styles.backdrop} onClick={onClose} role="presentation" />
      <div
        ref={trapRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="folder-dialog-title"
      >
        <h2 id="folder-dialog-title" className={styles.sheetTitle}>
          {mode.kind === "create" ? t("createFolder") : t("renameFolder")}
        </h2>
        <label className={styles.fieldLabel} htmlFor="folder-name-input">
          {t("folderNameLabel")}
        </label>
        <input
          id="folder-name-input"
          className={styles.textInput}
          value={name}
          maxLength={40}
          onChange={(event) => setName(event.target.value)}
          disabled={busy}
        />
        {error ? <p className={styles.errorBanner}>{error}</p> : null}
        <div className={styles.modalActions}>
          <button type="button" className={styles.button} onClick={onClose} disabled={busy}>
            {t("cancel")}
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonPrimary}`}
            onClick={() => void handleSubmit()}
            disabled={busy || name.trim().length === 0}
          >
            {t("save")}
          </button>
        </div>
      </div>
    </>
  );
});
