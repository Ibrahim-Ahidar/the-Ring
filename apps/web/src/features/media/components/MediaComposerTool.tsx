"use client";

import { memo, useRef } from "react";
import { Paperclip } from "lucide-react";
import { useTranslations } from "next-intl";

import type { ComposerToolProps } from "@/shell/slots/types";
import ui from "@/shell/styles/ui.module.css";

import { MediaProvider, useMedia } from "../context/MediaProvider";
import styles from "../media.module.css";

function MediaComposerToolInner({ conversationId, disabled }: ComposerToolProps) {
  const t = useTranslations("media");
  const { startUpload } = useMedia();
  const fileInput = useRef<HTMLInputElement>(null);

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) {
      return;
    }
    void startUpload({ conversationId, file });
    if (fileInput.current) {
      fileInput.current.value = "";
    }
  };

  return (
    <div className={styles.toolRow}>
      <input
        ref={fileInput}
        id={`media-file-${conversationId}`}
        className={styles.hiddenInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,text/plain,audio/*"
        onChange={(event) => onFiles(event.target.files)}
      />
      <button
        type="button"
        className={ui.iconBtn}
        disabled={disabled}
        onClick={() => fileInput.current?.click()}
        aria-label={t("attachFiles")}
        title={t("attachFiles")}
      >
        <Paperclip size={24} aria-hidden />
      </button>
    </div>
  );
}

function MediaComposerToolWithProvider(props: ComposerToolProps) {
  return (
    <MediaProvider>
      <MediaComposerToolInner {...props} />
    </MediaProvider>
  );
}

export const MediaComposerTool = memo(MediaComposerToolWithProvider);
