"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { reportError } from "@/platform/telemetry";
import ui from "@/shell/styles/ui.module.css";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
  /** Where the boundary sits, for the telemetry context. */
  boundary: string;
};

/** Localized route error boundary body with a retry button. */
export function ErrorScreen({ error, reset, boundary }: Props) {
  const t = useTranslations("shell.errors");

  useEffect(() => {
    void reportError(error, { boundary, digest: error.digest });
  }, [error, boundary]);

  return (
    <div role="alert" style={{ padding: "2rem" }}>
      <h1>{t("title")}</h1>
      <p>{t("body")}</p>
      {error.digest ? <p>{t("reference", { digest: error.digest })}</p> : null}
      <button type="button" className={`${ui.btn} ${ui.btnPrimary}`} onClick={reset}>
        {t("retry")}
      </button>
    </div>
  );
}
