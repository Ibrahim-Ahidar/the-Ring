"use client";

import { useCallback } from "react";
import { Flag } from "lucide-react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

import { requestReportDialog } from "../safety-events";
import styles from "./PrivacySettings.module.css";

type ReportUserButtonProps = {
  userId: string;
  subjectLabel?: string | null;
};

export function ReportUserButton({
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
    <button type="button" className={`${ui.setting} ${styles.dangerRow}`} onClick={open}>
      <Flag size={20} aria-hidden />
      <span className={ui.settingBody}>{t("report.action")}</span>
    </button>
  );
}
