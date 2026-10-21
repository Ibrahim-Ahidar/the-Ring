"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Mic, SendHorizontal, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { emitComposerActivity } from "@/platform/composer-events";
import { AUDIO_MAX_DURATION_MS } from "@/platform/media";

import { clampRecordingMs } from "../clamp-recording-ms";
import ui from "@/shell/styles/ui.module.css";

import styles from "../media.module.css";

type Props = {
  conversationId: string;
  disabled: boolean;
  onBlob: (file: File, durationMs: number) => void;
};

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Composer send action: a mic while idle; while recording, a bar (cancel, timer) plus a send
 * arrow. Renders flex children of the composer row; the composer hides its textarea on the
 * `recording` activity event.
 */
function VoiceRecorderInner({ conversationId, disabled, onBlob }: Props) {
  const t = useTranslations("media");
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const startedAt = useRef(0);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);
  const discard = useRef(false);
  const active = useRef(false);
  const onBlobRef = useRef(onBlob);
  onBlobRef.current = onBlob;

  const emitActive = useCallback(
    (value: boolean) => {
      if (active.current === value) {
        return;
      }
      active.current = value;
      emitComposerActivity({ kind: "recording", conversationId, active: value });
    },
    [conversationId],
  );

  const clearTimers = useCallback(() => {
    if (stopTimer.current) {
      clearTimeout(stopTimer.current);
      stopTimer.current = null;
    }
    if (tick.current) {
      clearInterval(tick.current);
      tick.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearTimers();
      // Leaving mid-recording discards it; the stream is released in onstop.
      discard.current = true;
      if (mediaRecorder.current?.state === "recording") {
        mediaRecorder.current.stop();
      }
      emitActive(false);
    };
  }, [clearTimers, emitActive]);

  const stopRecording = useCallback(
    (cancel: boolean) => {
      clearTimers();
      discard.current = cancel;
      if (mediaRecorder.current?.state === "recording") {
        mediaRecorder.current.stop();
      }
      setRecording(false);
      emitActive(false);
    },
    [clearTimers, emitActive],
  );

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
        if (discard.current) {
          chunks.current = [];
          return;
        }
        const durationMs = clampRecordingMs(Date.now() - startedAt.current);
        // Browsers report e.g. "audio/webm;codecs=opus"; the server only accepts the bare type.
        const mimeType = (recorder.mimeType || "audio/webm").split(";")[0].trim().toLowerCase();
        const extension = mimeType === "audio/mp4" ? "m4a" : mimeType === "audio/ogg" ? "ogg" : "webm";
        const blob = new Blob(chunks.current, { type: mimeType });
        const file = new File([blob], `voice-${Date.now()}.${extension}`, {
          type: mimeType,
        });
        onBlobRef.current(file, durationMs);
      };
      mediaRecorder.current = recorder;
      discard.current = false;
      startedAt.current = Date.now();
      recorder.start();
      setElapsed(0);
      setRecording(true);
      emitActive(true);
      tick.current = setInterval(() => setElapsed(Date.now() - startedAt.current), 250);
      stopTimer.current = setTimeout(() => {
        stopRecording(false);
      }, AUDIO_MAX_DURATION_MS);
    } catch {
      setErrorKey("micDenied");
    }
  };

  if (recording) {
    return (
      <>
        <div className={styles.recordingBar} role="timer" aria-label={t("recordingTime")}>
          <button
            type="button"
            className={ui.iconBtn}
            onClick={() => stopRecording(true)}
            aria-label={t("cancelRecording")}
            title={t("cancelRecording")}
          >
            <Trash2 size={22} aria-hidden />
          </button>
          <span className={styles.recordingDot} aria-hidden />
          <span className={styles.recordingTime}>{formatElapsed(elapsed)}</span>
        </div>
        <button
          type="button"
          className={`${ui.iconBtn} ${ui.iconBtnAccent} ${styles.voiceBtn}`}
          onClick={() => stopRecording(false)}
          aria-label={t("sendRecording")}
          title={t("sendRecording")}
        >
          <SendHorizontal size={24} className="flip-rtl" aria-hidden />
        </button>
      </>
    );
  }

  return (
    <>
      {errorKey ? (
        <span className={styles.recorderError} role="alert">
          {t(errorKey)}
        </span>
      ) : null}
      <button
        type="button"
        className={`${ui.iconBtn} ${ui.iconBtnAccent} ${styles.voiceBtn}`}
        disabled={disabled}
        onClick={() => void startRecording()}
        aria-label={t("startRecording")}
        title={t("startRecording")}
      >
        <Mic size={24} aria-hidden />
      </button>
    </>
  );
}

export const VoiceRecorder = memo(VoiceRecorderInner);
