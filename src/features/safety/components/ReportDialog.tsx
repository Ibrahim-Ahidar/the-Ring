"use client";

import { memo, useCallback, useId, useState } from "react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

import { REPORT_CATEGORIES } from "../safety-events";
import type { ReportCategory } from "../types";
import { useFocusTrap } from "../hooks/useFocusTrap";

type ReportDialogProps = {
  subjectLabel?: string | null;
  onSubmit: (input: {
    category: ReportCategory;
    details: string;
  }) => Promise<boolean>;
  onClose: () => void;
};

export const ReportDialog = memo(function ReportDialog({
  subjectLabel,
  onSubmit,
  onClose,
}: ReportDialogProps) {
  const t = useTranslations("safety");
  const trapRef = useFocusTrap(true);
  const detailsId = useId();
  const [category, setCategory] = useState<ReportCategory>("spam");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (details.length > 1000) {
      setError(t("errors.detailsTooLong"));
      return;
    }
    setBusy(true);
    setError(null);
    const ok = await onSubmit({ category, details: details.trim() });
    setBusy(false);
    if (ok) {
      onClose();
    } else {
      setError(t("errors.generic"));
    }
  }, [category, details, onClose, onSubmit, t]);

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
        aria-labelledby="report-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="report-dialog-title" className={ui.dialogTitle}>
          {t("report.dialogTitle")}
        </h2>
        {subjectLabel ? (
          <p className={ui.dialogText}>{t("report.subject", { subject: subjectLabel })}</p>
        ) : null}
        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor="report-category">
            {t("report.categoryLabel")}
          </label>
          <select
            id="report-category"
            className={ui.input}
            value={category}
            onChange={(event) => setCategory(event.target.value as ReportCategory)}
            disabled={busy}
          >
            {REPORT_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {t(`report.categories.${value}`)}
              </option>
            ))}
          </select>
        </div>
        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor={detailsId}>
            {t("report.detailsLabel")}
          </label>
          <textarea
            id={detailsId}
            className={ui.input}
            value={details}
            maxLength={1000}
            onChange={(event) => setDetails(event.target.value)}
            disabled={busy}
          />
        </div>
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
            onClick={handleSubmit}
            disabled={busy}
          >
            {t("report.submit")}
          </button>
        </div>
      </div>
    </div>
  );
});
