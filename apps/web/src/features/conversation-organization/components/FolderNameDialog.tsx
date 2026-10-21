"use client";

import { memo, useCallback, useState } from "react";
import { useTranslations } from "next-intl";

import { createFolderAction, renameFolderAction } from "../actions";
import { organizationErrorMessage } from "../error-message";
import type { FolderDialogMode } from "../organization-events";
import { useFocusTrap } from "../hooks/useFocusTrap";
import ui from "@/shell/styles/ui.module.css";

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
  const trapRef = useFocusTrap<HTMLFormElement>(true);
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
    <div
      className={`${ui.scrim} ${ui.scrimCenter} ${ui.scrimSheet}`}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <form
        ref={trapRef}
        className={ui.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="folder-dialog-title"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy && name.trim().length > 0) {
            void handleSubmit();
          }
        }}
      >
        <h2 id="folder-dialog-title" className={ui.dialogTitle}>
          {mode.kind === "create" ? t("createFolder") : t("renameFolder")}
        </h2>
        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor="folder-name-input">
            {t("folderNameLabel")}
          </label>
          <input
            id="folder-name-input"
            className={ui.input}
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
            disabled={busy}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "folder-dialog-error" : undefined}
          />
          {error ? (
            <p id="folder-dialog-error" className={ui.fieldError} role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className={ui.dialogActions}>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            onClick={onClose}
            disabled={busy}
          >
            {t("cancel")}
          </button>
          <button
            type="submit"
            className={`${ui.btn} ${ui.btnPrimary}`}
            disabled={busy || name.trim().length === 0}
          >
            {t("save")}
          </button>
        </div>
      </form>
    </div>
  );
});
