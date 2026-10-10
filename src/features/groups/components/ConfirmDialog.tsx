"use client";

import { memo, useEffect, useRef, type ReactNode } from "react";

import ui from "@/shell/styles/ui.module.css";

type Props = {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
};

function ConfirmDialogInner({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  destructive,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  return (
    <div
      className={`${ui.scrim} ${ui.scrimCenter} ${ui.scrimSheet}`}
      role="presentation"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <div
        className={ui.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
      >
        <h2 id="confirm-title" className={ui.dialogTitle}>
          {title}
        </h2>
        <div id="confirm-body" className={ui.dialogText}>
          {body}
        </div>
        <div className={ui.dialogActions}>
          <button
            ref={cancelRef}
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`${ui.btn} ${destructive ? ui.btnDanger : ui.btnPrimary}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export const ConfirmDialog = memo(ConfirmDialogInner);
