"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { useTranslations } from "next-intl";

import { AUDIO_MAX_DURATION_MS } from "@/platform/media";

import { clampRecordingMs } from "../clamp-recording-ms";
import styles from "../media.module.css";

type Props = {
  disabled: boolean;
  onBlob: (file: File, durationMs: number) => void;
};

function VoiceRecorderInner({ disabled, onBlob }: Props) {
  const t = useTranslations("media");
  const [recording, setRecording] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const startedAt = useRef(0);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (stopTimer.current) {
        clearTimeout(stopTimer.current);
      }
      mediaRecorder.current?.stop();
    };
  }, []);

  const stopRecording = useCallback(() => {
    if (stopTimer.current) {
      clearTimeout(stopTimer.current);
      stopTimer.current = null;
    }
    mediaRecorder.current?.stop();
    setRecording(false);
  }, []);

  const startRecording = async () => {
    setErrorKey(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunks.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.current.push(event.data);
        }
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const durationMs = clampRecordingMs(Date.now() - startedAt.current);
        const blob = new Blob(chunks.current, { type: recorder.mimeType || "audio/webm" });
        const file = new File([blob], `voice-${Date.now()}.webm`, {
          type: blob.type,
        });
        onBlob(file, durationMs);
      };
      mediaRecorder.current = recorder;
      startedAt.current = Date.now();
      recorder.start();
      setRecording(true);
      stopTimer.current = setTimeout(() => {
        stopRecording();
      }, AUDIO_MAX_DURATION_MS);
    } catch {
      setErrorKey("micDenied");
    }
  };

  return (
    <div className={styles.toolRow}>
      <button
        type="button"
        className={styles.iconButton}
        disabled={disabled}
        onClick={() => (recording ? stopRecording() : void startRecording())}
        aria-label={recording ? t("stopRecording") : t("startRecording")}
      >
        {recording ? <Square size={18} /> : <Mic size={18} />}
      </button>
      {errorKey ? <span role="alert">{t(errorKey)}</span> : null}
    </div>
  );
}

export const VoiceRecorder = memo(VoiceRecorderInner);
