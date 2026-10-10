"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

import styles from "../media.module.css";

type Props = {
  progress: number;
  failed?: boolean;
  onRetry?: () => void;
  onCancel?: () => void;
};

function UploadProgressInner({ progress, failed, onRetry, onCancel }: Props) {
  const t = useTranslations("media");
  const pct = Math.round(progress * 100);

  return (
    <div className={styles.upload}>
      <div
        className={styles.progress}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t("uploadProgress")}
      >
        <div className={styles.progressBar} style={{ width: `${pct}%` }} />
      </div>
      {failed ? (
        <div className={styles.uploadFailed}>
          <span>{t("uploadFailed")}</span>
          {onRetry ? (
            <button type="button" className={ui.linkBtn} onClick={onRetry} aria-label={t("retryUpload")}>
              {t("retry")}
            </button>
          ) : null}
          {onCancel ? (
            <button type="button" className={ui.linkBtn} onClick={onCancel} aria-label={t("cancelUpload")}>
              {t("cancel")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export const UploadProgress = memo(UploadProgressInner);
