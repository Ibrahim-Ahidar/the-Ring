"use client";

import { memo, useState } from "react";
import { Download } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

import { getDownloadUrlAction } from "../actions";
import { formatByteSize } from "../format-bytes";
import styles from "../media.module.css";

type Props = {
  attachmentId: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
};

type FileKind = "pdf" | "doc" | "zip" | "other";

function fileBadge(fileName: string, mimeType: string): { label: string; kind: FileKind } {
  const ext = fileName.includes(".") ? fileName.split(".").pop()! : (mimeType.split("/").pop() ?? "");
  const label = ext.slice(0, 4).toUpperCase() || "FILE";
  if (/pdf/i.test(ext) || mimeType === "application/pdf") {
    return { label, kind: "pdf" };
  }
  if (/^(docx?|odt|rtf|txt|md)$/i.test(ext) || mimeType.startsWith("text/")) {
    return { label, kind: "doc" };
  }
  if (/^(zip|rar|7z|gz|tar)$/i.test(ext)) {
    return { label, kind: "zip" };
  }
  return { label, kind: "other" };
}

function MediaDownloadButtonInner({
  attachmentId,
  fileName,
  sizeBytes,
  mimeType,
}: Props) {
  const t = useTranslations("media");
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const badge = fileBadge(fileName, mimeType);

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
    <div className={styles.file}>
      <span className={styles.fileIcon} data-kind={badge.kind} aria-hidden>
        {badge.label}
      </span>
      <div className={styles.fileBody}>
        <div className={styles.fileName}>{fileName}</div>
        <div className={styles.fileMeta}>
          {mimeType} · {formatByteSize(sizeBytes, locale)}
        </div>
      </div>
      <button
        type="button"
        className={`${ui.iconBtn} ${ui.iconBtnSm}`}
        onClick={() => void onDownload()}
        disabled={busy}
        aria-label={t("downloadLabel", { name: fileName })}
        title={t("download")}
      >
        <Download size={18} aria-hidden />
      </button>
    </div>
  );
}

export const MediaDownloadButton = memo(MediaDownloadButtonInner);
