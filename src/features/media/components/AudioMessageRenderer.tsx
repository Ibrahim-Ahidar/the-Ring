"use client";

import { memo, useMemo, useRef, useState } from "react";
import { CheckCheck, Pause, Play } from "lucide-react";
import { useTranslations } from "next-intl";

import type { TimelineMessage } from "@/platform/timeline";

import { markAudioPlayedAction } from "../actions";
import { shouldRecordPlay } from "../audio-played";
import { useAudioPlayed } from "../hooks/useAudioPlayed";
import { useAttachmentList } from "../hooks/useAttachmentList";
import { useDownloadUrl } from "../hooks/useDownloadUrl";
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

function AudioMessageRendererInner({ message, currentUserId }: Props) {
  const isOwn = message.sender_id === currentUserId;
  const t = useTranslations("media");
  const attachments = useAttachmentList(message.id, message.attachments);
  const attachment = attachments[0];
  const phase = uploadPhase(message);
  const uploading = phase === "pending" || phase === "failed";
  const audioRef = useRef<HTMLAudioElement>(null);
  const recordedRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const played = useAudioPlayed(message.id, isOwn && message.status !== "pending");
  const src = useDownloadUrl(uploading ? null : attachment?.id);

  const waveform = useMemo(() => {
    const raw = attachment?.waveform;
    if (!Array.isArray(raw)) {
      return [];
    }
    return raw.slice(0, 64).map((value) => Number(value));
  }, [attachment?.waveform]);

  if (uploading) {
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

  const durationMs = attachment.duration_ms ?? 0;
  const durationLabel = formatMs(durationMs);
  const progress = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;
  const playedBars = Math.round(progress * waveform.length);
  const started = playing || positionMs > 0;

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
    try {
      await el.play();
      setPlaying(true);
      if (shouldRecordPlay({ isOwn, alreadyRecorded: recordedRef.current })) {
        recordedRef.current = true;
        void markAudioPlayedAction({ messageId: message.id });
      }
    } catch {
      setPlaying(false);
    }
  };

  return (
    <div className={styles.voice}>
      <button
        type="button"
        className={styles.voicePlay}
        onClick={() => void toggle()}
        disabled={!src}
        aria-label={playing ? t("pauseAudio") : t("playAudio")}
      >
        {playing ? <Pause size={18} aria-hidden /> : <Play size={18} aria-hidden />}
      </button>
      <div className={styles.voiceTrack}>
        {waveform.length > 0 ? (
          <div className={styles.voiceWave} aria-hidden>
            {waveform.map((amp, index) => (
              <span
                key={index}
                data-played={index < playedBars ? "true" : "false"}
                style={{ height: `${Math.max(8, amp * 100)}%` }}
              />
            ))}
          </div>
        ) : (
          <div className={styles.voiceLine} aria-hidden>
            <span style={{ inlineSize: `${progress * 100}%` }} />
          </div>
        )}
        <span
          className={styles.voiceTime}
          aria-label={t("durationLabel", { time: durationLabel })}
        >
          {started ? `${formatMs(positionMs)} / ${durationLabel}` : durationLabel}
        </span>
      </div>
      {isOwn && played ? (
        <span
          className={styles.voicePlayed}
          title={t("audioPlayed")}
          aria-label={t("audioPlayed")}
          role="img"
        >
          <CheckCheck size={14} aria-hidden />
        </span>
      ) : null}
      {src ? (
        <audio
          ref={audioRef}
          src={src}
          onTimeUpdate={(event) => setPositionMs(event.currentTarget.currentTime * 1000)}
          onEnded={() => {
            setPlaying(false);
            setPositionMs(0);
          }}
          preload="metadata"
        />
      ) : null}
    </div>
  );
}

export const AudioMessageRenderer = memo(AudioMessageRendererInner);
