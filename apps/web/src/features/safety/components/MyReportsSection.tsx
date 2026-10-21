"use client";

import { memo } from "react";
import { Flag } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

import { useSafety } from "../context/safety-context";
import styles from "./PrivacySettings.module.css";

export const MyReportsSection = memo(function MyReportsSection() {
  const t = useTranslations("safety");
  const format = useFormatter();
  const { state, refreshReports } = useSafety();
  const { reports, reportsLoading, reportsError } = state;

  return (
    <section className={ui.settingsCard} aria-labelledby="reports-heading">
      <div className={ui.settingsCardHead}>
        <h2 id="reports-heading" className={ui.settingsCardTitle}>
          {t("report.listTitle")}
        </h2>
      </div>

      {reportsError ? (
        <p className={`${ui.errorText} ${styles.cardNote}`} role="alert">
          {t("errors.generic")}{" "}
          <button type="button" className={ui.linkBtn} onClick={() => void refreshReports()}>
            {t("actions.retry")}
          </button>
        </p>
      ) : null}

      {reportsLoading ? <p className={styles.cardNote}>{t("states.loading")}</p> : null}

      {!reportsLoading && reports.length === 0 ? (
        <p className={styles.cardNote}>{t("report.empty")}</p>
      ) : null}

      {!reportsLoading && reports.length > 0 ? (
        <ul className={styles.list}>
          {reports.map((row) => (
            <li key={row.id} className={ui.setting}>
              <Flag size={20} aria-hidden />
              <span className={ui.settingBody}>
                {t(`report.categories.${row.category}`)}
                <span className={ui.settingDesc}>
                  {format.dateTime(new Date(row.createdAt), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </span>
              <span className={`${ui.tag} ${ui.tagNeutral}`}>
                {t(`report.status.${row.status}`)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
});
