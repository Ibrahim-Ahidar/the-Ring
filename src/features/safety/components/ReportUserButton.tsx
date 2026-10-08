"use client";

import { memo, useCallback } from "react";
import { useTranslations } from "next-intl";

import { requestReportDialog } from "../safety-events";
import styles from "./PrivacySettings.module.css";

type ReportUserButtonProps = {
  userId: string;
  subjectLabel?: string | null;
};

export const ReportUserButton = memo(function ReportUserButton({
  userId,
  subjectLabel,
}: ReportUserButtonProps) {
  const t = useTranslations("safety");

  const open = useCallback(() => {
    requestReportDialog({
      targetUserId: userId,
      subjectLabel: subjectLabel ?? null,
    });
  }, [subjectLabel, userId]);

  return (
    <button type="button" className={styles.button} onClick={open}>
      {t("report.action")}
    </button>
  );
});
