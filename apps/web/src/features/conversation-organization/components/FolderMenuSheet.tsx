"use client";

import { ArrowLeft, ArrowRight, Pencil, Trash2 } from "lucide-react";
import { memo, useCallback, useState } from "react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

import { deleteFolderAction, reorderFoldersAction } from "../actions";
import { organizationErrorMessage } from "../error-message";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { requestFolderDialog } from "../organization-events";
import type { ChatFolder } from "../types";
import styles from "../conversation-organization.module.css";

type Props = {
  folder: ChatFolder;
  /** Every folder in chip order (by position). */
  folders: ChatFolder[];
  /** The chip row reads right to left, so "left" means a later position. */
  rtl: boolean;
  onClose: () => void;
  /** Called after the folder list changed on the server. */
  onChanged: (change: { deletedId?: string }) => void;
};

/**
 * Menu for one folder chip: Rename, Move left, Move right, Delete. Opens as a
 * bottom sheet like the conversation menu. Delete asks first and only removes
 * the folder: its chats stay where they are and are never archived.
 */
export const FolderMenuSheet = memo(function FolderMenuSheet({
  folder,
  folders,
  rtl,
  onClose,
  onChanged,
}: Props) {
  const t = useTranslations("conversation-organization");
  const trapRef = useFocusTrap(true);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const index = folders.findIndex((f) => f.id === folder.id);
  const leftTarget = rtl ? index + 1 : index - 1;
  const rightTarget = rtl ? index - 1 : index + 1;
  const canMoveLeft = leftTarget >= 0 && leftTarget < folders.length;
  const canMoveRight = rightTarget >= 0 && rightTarget < folders.length;

  const move = useCallback(
    async (target: number) => {
      const ids = folders.map((f) => f.id);
      const [moved] = ids.splice(index, 1);
      ids.splice(target, 0, moved!);
      setBusy(true);
      setError(null);
      const result = await reorderFoldersAction(ids);
      setBusy(false);
      if (!result.ok) {
        setError(organizationErrorMessage(t, result.error?.code));
        return;
      }
      onChanged({});
      onClose();
    },
    [folders, index, onChanged, onClose, t],
  );

  const remove = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await deleteFolderAction(folder.id);
    setBusy(false);
    if (!result.ok) {
      setError(organizationErrorMessage(t, result.error?.code));
      return;
    }
    onChanged({ deletedId: folder.id });
    onClose();
  }, [folder.id, onChanged, onClose, t]);

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
      <div
        ref={trapRef}
        className={`${ui.menu} ${styles.sheet}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="folder-menu-title"
      >
        <h2 id="folder-menu-title" className={styles.sheetTitle}>
          {confirming ? t("deleteFolderTitle", { name: folder.name }) : folder.name}
        </h2>
        {error ? (
          <p className={`${ui.errorText} ${styles.sheetError}`} role="alert">
            {error}
          </p>
        ) : null}
        {confirming ? (
          <>
            <p className={styles.sheetError}>{t("deleteFolderBody")}</p>
            <div className={ui.dialogActions}>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnSecondary}`}
                disabled={busy}
                onClick={() => setConfirming(false)}
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnPrimary}`}
                disabled={busy}
                onClick={() => void remove()}
              >
                {t("deleteFolderConfirm")}
              </button>
            </div>
          </>
        ) : (
          <>
            <ul className={styles.menuList}>
              <li>
                <button
                  type="button"
                  className={ui.menuItem}
                  disabled={busy}
                  onClick={() => {
                    requestFolderDialog({
                      kind: "rename",
                      folderId: folder.id,
                      currentName: folder.name,
                    });
                    onClose();
                  }}
                >
                  <Pencil aria-hidden />
                  {t("renameFolder")}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={ui.menuItem}
                  disabled={busy || !canMoveLeft}
                  onClick={() => void move(leftTarget)}
                >
                  <ArrowLeft aria-hidden />
                  {t("moveFolderLeft")}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={ui.menuItem}
                  disabled={busy || !canMoveRight}
                  onClick={() => void move(rightTarget)}
                >
                  <ArrowRight aria-hidden />
                  {t("moveFolderRight")}
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className={`${ui.menuItem} ${ui.menuItemDanger}`}
                  disabled={busy}
                  onClick={() => setConfirming(true)}
                >
                  <Trash2 aria-hidden />
                  {t("deleteFolder")}
                </button>
              </li>
            </ul>
            <hr className={ui.menuSep} />
            <button type="button" className={ui.menuItem} onClick={onClose} disabled={busy}>
              {t("close")}
            </button>
          </>
        )}
      </div>
    </div>
  );
});
