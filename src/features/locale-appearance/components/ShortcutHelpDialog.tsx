"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { useAppearance } from "@/features/locale-appearance/context/AppearanceContext";
import styles from "@/features/locale-appearance/components/locale-appearance.module.css";
import {
  GLOBAL_SHORTCUTS,
  formatShortcutLabel,
} from "@/features/locale-appearance/shortcuts";

const SHORTCUT_LABEL_KEYS: Record<string, string> = {
  palette: "shortcutPalette",
  chats: "shortcutChats",
  search: "shortcutSearch",
  settings: "shortcutSettings",
  help: "shortcutHelp",
};

function ShortcutHelpDialogInner() {
  const t = useTranslations("locale-appearance");
  const { state, dispatch } = useAppearance();
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/i.test(navigator.platform);

  const close = useCallback(() => {
    dispatch({ type: "close_help" });
    const restore = restoreFocusRef.current;
    if (restore && typeof restore.focus === "function") {
      restore.focus();
    }
  }, [dispatch]);

  useEffect(() => {
    if (!state.helpOpen) {
      return;
    }
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
  }, [state.helpOpen]);

  if (!state.helpOpen) {
    return null;
  }

  return (
    <>
      <div className={styles.backdrop} aria-hidden onClick={close} />
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={t("shortcutHelpTitle")}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
        }}
      >
        <div className={styles.dialogHeader}>
          <h2 className={styles.dialogTitle}>{t("shortcutHelpTitle")}</h2>
        </div>
        <ul className={styles.shortcutList}>
          {GLOBAL_SHORTCUTS.map((shortcut) => (
            <li key={shortcut.id} className={styles.shortcutRow}>
              <span>{t(SHORTCUT_LABEL_KEYS[shortcut.id] ?? shortcut.id)}</span>
              <span className={styles.shortcutKeys}>
                {formatShortcutLabel(shortcut, isMac)}
              </span>
            </li>
          ))}
        </ul>
        <button type="button" className={styles.closeButton} onClick={close}>
          {t("shortcutHelpClose")}
        </button>
      </div>
    </>
  );
}

export const ShortcutHelpDialog = memo(ShortcutHelpDialogInner);
