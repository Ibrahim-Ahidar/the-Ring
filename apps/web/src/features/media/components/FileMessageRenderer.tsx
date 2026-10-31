"use client";

import { memo } from "react";

import type { TimelineMessage } from "@pulse/core/timeline";

import { getEncryptedMediaRef } from "../hooks/useEncryptedMedia";
import { EncryptedMediaView } from "./EncryptedMediaView";
import { useAttachmentList } from "../hooks/useAttachmentList";
import { uploadPhase } from "../upload-status";
import { MediaDownloadButton } from "./MediaDownloadButton";
import { UploadProgress } from "./UploadProgress";

type Props = {
  message: TimelineMessage;
  currentUserId: string;
};

function FileMessageRendererInner({ message }: Props) {
  const attachments = useAttachmentList(message.id, message.attachments);
  const attachment = attachments[0];
  const phase = uploadPhase(message);

  if (phase === "pending" || phase === "failed") {
    return (
      <UploadProgress
        progress={phase === "failed" ? 0 : 0.35}
        failed={phase === "failed"}
      />
    );
  }

  if (!attachment) {
    return null;
  }

  return (
    <MediaDownloadButton
      attachmentId={attachment.id}
      fileName={attachment.file_name ?? attachment.mime_type}
      sizeBytes={attachment.size_bytes}
      mimeType={attachment.mime_type}
    />
  );
}

function FileMessageRendererSwitch(props: Props) {
  // Encrypted media (e2ee flag on) has its own view; the legacy attachment path is untouched.
  return getEncryptedMediaRef(props.message) ? (
    <EncryptedMediaView {...props} />
  ) : (
    <FileMessageRendererInner {...props} />
  );
}

export const FileMessageRenderer = memo(FileMessageRendererSwitch);
