"use client";

import { memo, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
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

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function AudioMessageRendererInner({ message }: Props) {
  const t = useTranslations("media");
  const attachments = useAttachmentList(message.id, message.attachments);
  const attachment = attachments[0];
  const phase = uploadPhase(message);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [src, setSrc] = useState<string | null>(null);

  const waveform = useMemo(() => {
    const raw = attachment?.waveform;
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.slice(0, 64).map((value) => Number(value));
  }, [attachment?.waveform]);

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

  if (!src) {
    void getDownloadUrlAction({ attachmentId: attachment.id }).then((result) => {
      if (result.ok) {
        setSrc(result.value.url);
      }
    });
  }

  const durationLabel = formatMs(attachment.duration_ms ?? 0);

  const toggle = async () => {
    const el = audioRef.current;
    if (!el) {
      return;
    }
    if (playing) {
      el.pause();
      setPlaying(false);
      return;
    }
    await el.play();
    setPlaying(true);
  };

  return (
    <div className={styles.audioRoot}>
      {waveform.length > 0 ? (
        <div className={styles.waveform} aria-hidden>
          {waveform.map((amp, index) => (
            <span
              key={index}
              className={styles.waveBar}
              style={{ height: `${Math.max(8, amp * 100)}%` }}
            />
          ))}
        </div>
      ) : null}
      <div className={styles.toolRow}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => void toggle()}
          aria-label={playing ? t("pauseAudio") : t("playAudio")}
        >
          {playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <span aria-label={t("durationLabel", { time: durationLabel })}>
          {durationLabel}
        </span>
      </div>
      {src ? (
        <audio
          ref={audioRef}
          src={src}
          onEnded={() => setPlaying(false)}
          preload="metadata"
        />
      ) : null}
    </div>
  );
}

export const AudioMessageRenderer = memo(AudioMessageRendererInner);
