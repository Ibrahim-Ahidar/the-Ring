"use client";

import { memo } from "react";

import type { ComposerToolProps } from "@/shell/slots/types";

import { MediaProvider, useMedia } from "../context/MediaProvider";
import { VoiceRecorder } from "./VoiceRecorder";

function VoiceSendActionInner({ conversationId, disabled }: ComposerToolProps) {
  const { startUpload } = useMedia();

  return (
    <VoiceRecorder
      conversationId={conversationId}
      disabled={disabled}
      onBlob={(file, durationMs) => {
        void startUpload({ conversationId, file, durationMs });
      }}
    />
  );
}

function VoiceSendActionWithProvider(props: ComposerToolProps) {
  return (
    <MediaProvider>
      <VoiceSendActionInner {...props} />
    </MediaProvider>
  );
}

export const VoiceSendAction = memo(VoiceSendActionWithProvider);
