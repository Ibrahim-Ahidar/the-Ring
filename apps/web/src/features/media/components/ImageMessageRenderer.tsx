"use client";

import { memo, useMemo } from "react";
import { useTranslations } from "next-intl";

import type { TimelineMessage } from "@pulse/core/timeline";

import { useAttachmentList } from "../hooks/useAttachmentList";
import { useDownloadUrl } from "../hooks/useDownloadUrl";
import styles from "../media.module.css";
import { uploadPhase } from "../upload-status";
import { UploadProgress } from "./UploadProgress";

type Props = {
  message: TimelineMessage;
  currentUserId: string;
};

function ImageMessageRendererInner({ message }: Props) {
  const t = useTranslations("media");
  const attachments = useAttachmentList(message.id, message.attachments);
  const attachment = attachments[0];
  const phase = uploadPhase(message);
  const uploading = phase === "pending" || phase === "failed";
  const src = useDownloadUrl(uploading ? null : attachment?.id);

  const aspectStyle = useMemo(() => {
    if (!attachment?.width || !attachment?.height) {
      return undefined;
    }
    return { aspectRatio: `${attachment.width} / ${attachment.height}` };
  }, [attachment?.height, attachment?.width]);

  if (uploading) {
    return (
      <UploadProgress
        progress={phase === "failed" ? 0 : 0.35}
        failed={phase === "failed"}
      />
    );
  }

  if (!attachment) {
    return <span className={styles.missing}>{t("attachmentMissing")}</span>;
  }

  return (
    <figure className={styles.imageFrame} style={aspectStyle}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={attachment.file_name ?? t("imageAlt")}
          width={attachment.width ?? undefined}
          height={attachment.height ?? undefined}
        />
      ) : (
        <span className="sr-only">{t("loadingImage")}</span>
      )}
    </figure>
  );
}

export const ImageMessageRenderer = memo(ImageMessageRendererInner);
