"use client";

import { memo, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import type { TimelineMessage } from "@/platform/timeline";

import { getDownloadUrlAction } from "../actions";
import { useAttachmentList } from "../hooks/useAttachmentList";
import styles from "../media.module.css";
import { uploadPhase } from "../upload-status";
import { UploadProgress } from "./UploadProgress";

type Props = {
  message: TimelineMessage;
  currentUserId: string;
};

function ImageMessageRendererInner({ message, currentUserId }: Props) {
  const t = useTranslations("media");
  const attachments = useAttachmentList(message.id, message.attachments);
  const attachment = attachments[0];
  const phase = uploadPhase(message);
  const isMine = message.sender_id === currentUserId;
  const [src, setSrc] = useState<string | null>(null);

  const aspectStyle = useMemo(() => {
    if (!attachment?.width || !attachment?.height) {
      return undefined;
    }
    return { aspectRatio: `${attachment.width} / ${attachment.height}` };
  }, [attachment?.height, attachment?.width]);

  if (!attachment && phase !== "pending" && phase !== "failed") {
    return <p>{t("attachmentMissing")}</p>;
  }

  if (phase === "pending" || phase === "failed") {
    return (
      <UploadProgress
        progress={phase === "failed" ? 0 : 0.35}
        failed={phase === "failed"}
      />
    );
  }

  if (!src && attachment) {
    void getDownloadUrlAction({ attachmentId: attachment.id }).then((result) => {
      if (result.ok) {
        setSrc(result.value.url);
      }
    });
  }

  return (
    <figure className={styles.imageFrame} style={aspectStyle}>
      {src ? (
        <img
          src={src}
          alt={attachment?.file_name ?? t("imageAlt")}
          width={attachment?.width ?? undefined}
          height={attachment?.height ?? undefined}
        />
      ) : (
        <p>{t("loadingImage")}</p>
      )}
      {isMine ? null : null}
    </figure>
  );
}

export const ImageMessageRenderer = memo(ImageMessageRendererInner);
