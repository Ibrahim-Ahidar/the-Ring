"use client";

import { memo } from "react";
import { useFormatter, useTranslations } from "next-intl";

import { useSafety } from "../context/safety-context";
import styles from "./PrivacySettings.module.css";

export const MyReportsSection = memo(function MyReportsSection() {
  const t = useTranslations("safety");
  const format = useFormatter();
  const { state, refreshReports } = useSafety();
  const { reports, reportsLoading, reportsError } = state;

  return (
    <section className={styles.section} aria-labelledby="reports-heading">
      <h2 id="reports-heading" className={styles.sectionTitle}>
        {t("report.listTitle")}
      </h2>

      {reportsError ? (
        <p className={styles.errorBanner} role="alert">
          {t("errors.generic")}
          <button type="button" className={styles.button} onClick={() => void refreshReports()}>
            {t("actions.retry")}
          </button>
        </p>
      ) : null}

      {reportsLoading ? <p className={styles.muted}>{t("states.loading")}</p> : null}

      {!reportsLoading && reports.length === 0 ? (
        <p className={styles.muted}>{t("report.empty")}</p>
      ) : null}

      {!reportsLoading && reports.length > 0 ? (
        <ul className={styles.list}>
          {reports.map((row) => (
            <li key={row.id} className={styles.listItem}>
              <div>
                <div>{t(`report.categories.${row.category}`)}</div>
                <div className={styles.muted}>
                  {format.dateTime(new Date(row.createdAt), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </div>
              </div>
              <span className={styles.muted}>{t(`report.status.${row.status}`)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
});
