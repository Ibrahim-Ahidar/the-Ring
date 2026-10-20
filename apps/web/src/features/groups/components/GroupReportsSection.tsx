"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { Flag } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";

import type { GroupReportRow } from "@/features/safety/types";
import ui from "@/shell/styles/ui.module.css";

import {
  listGroupReportsAction,
  markGroupReportReviewedAction,
} from "../actions";
import styles from "../groups.module.css";

type Props = {
  conversationId: string;
  canModerate: boolean;
};

function GroupReportsSectionInner({ conversationId, canModerate }: Props) {
  const t = useTranslations("groups");
  const tSafety = useTranslations("safety");
  const format = useFormatter();
  const [reports, setReports] = useState<GroupReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!canModerate) {
      return;
    }
    setLoading(true);
    setError(false);
    const result = await listGroupReportsAction(conversationId);
    setLoading(false);
    if (!result.ok) {
      setError(true);
      return;
    }
    setReports(result.value.filter((row) => row.status === "open"));
  }, [canModerate, conversationId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canModerate) {
    return null;
  }

  return (
    <section className={ui.settingsCard} aria-labelledby="group-reports-title">
      <div className={ui.settingsCardHead}>
        <h2 id="group-reports-title" className={ui.settingsCardTitle}>
          {t("reportsTitle")}
        </h2>
      </div>

      {error ? (
        <p className={`${ui.errorText} ${styles.cardNote}`} role="alert">
          {t("errors.generic")}{" "}
          <button type="button" className={ui.linkBtn} onClick={() => void load()}>
            {t("actions.retry")}
          </button>
        </p>
      ) : null}

      {loading ? <p className={styles.cardNote}>{t("states.loading")}</p> : null}

      {!loading && !error && reports.length === 0 ? (
        <p className={styles.cardNote}>{t("reportsEmpty")}</p>
      ) : null}

      {!loading && !error && reports.length > 0 ? (
        <ul className={styles.memberList}>
          {reports.map((row) => (
            <li key={row.id} className={ui.setting}>
              <Flag size={20} aria-hidden />
              <span className={ui.settingBody}>
                {tSafety(`report.categories.${row.category}`)}
                <span className={ui.settingDesc}>
                  {format.dateTime(new Date(row.createdAt), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </span>
              <button
                type="button"
                className={`${ui.btn} ${ui.btnSm} ${ui.btnSecondary}`}
                onClick={() =>
                  void markGroupReportReviewedAction(row.id).then((result) => {
                    if (result.ok) {
                      void load();
                    }
                  })
                }
              >
                {t("markReviewed")}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export const GroupReportsSection = memo(GroupReportsSectionInner);
