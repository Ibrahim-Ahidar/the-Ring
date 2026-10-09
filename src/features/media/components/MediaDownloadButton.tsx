"use client";

import { memo, useState } from "react";
import { Download } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { getDownloadUrlAction } from "../actions";
import { formatByteSize } from "../format-bytes";
import styles from "../media.module.css";

type Props = {
  attachmentId: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
};

function MediaDownloadButtonInner({
  attachmentId,
  fileName,
  sizeBytes,
  mimeType,
}: Props) {
  const t = useTranslations("media");
  const locale = useLocale();
  const [busy, setBusy] = useState(false);

  const onDownload = async () => {
    setBusy(true);
    const result = await getDownloadUrlAction({ attachmentId });
    setBusy(false);
    if (!result.ok) {
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = result.value.url;
    anchor.download = result.value.fileName;
    anchor.rel = "noreferrer noopener";
    anchor.click();
  };

  return (
    <div className={styles.fileCard}>
      <p className={styles.fileMeta}>
        <strong>{fileName}</strong>
        <br />
        {mimeType} · {formatByteSize(sizeBytes, locale)}
      </p>
      <button
        type="button"
        className={styles.iconButton}
        onClick={() => void onDownload()}
        disabled={busy}
        aria-label={t("downloadLabel", { name: fileName })}
      >
        <Download size={18} aria-hidden />
        {t("download")}
      </button>
    </div>
  );
}

export const MediaDownloadButton = memo(MediaDownloadButtonInner);
