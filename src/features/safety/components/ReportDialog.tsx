"use client";

import { memo, useCallback, useId, useState } from "react";
import { useTranslations } from "next-intl";

import { REPORT_CATEGORIES } from "../safety-events";
import type { ReportCategory } from "../types";
import { useFocusTrap } from "../hooks/useFocusTrap";
import styles from "./PrivacySettings.module.css";

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
    <div className={styles.modalBackdrop} onClick={onClose} role="presentation">
      <div
        ref={trapRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="report-dialog-title" className={styles.modalTitle}>
          {t("report.dialogTitle")}
        </h2>
        {subjectLabel ? (
          <p className={styles.muted}>{t("report.subject", { subject: subjectLabel })}</p>
        ) : null}
        <label className={styles.row} htmlFor="report-category">
          <span className={styles.rowLabel}>{t("report.categoryLabel")}</span>
          <select
            id="report-category"
            className={styles.select}
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
        </label>
        <label className={styles.row} htmlFor={detailsId}>
          <span className={styles.rowLabel}>{t("report.detailsLabel")}</span>
          <textarea
            id={detailsId}
            className={styles.textarea}
            value={details}
            maxLength={1000}
            onChange={(event) => setDetails(event.target.value)}
            disabled={busy}
          />
        </label>
        {error ? <p className={styles.errorBanner}>{error}</p> : null}
        <div className={styles.modalActions}>
          <button type="button" className={styles.button} onClick={onClose} disabled={busy}>
            {t("actions.cancel")}
          </button>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonPrimary}`}
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
