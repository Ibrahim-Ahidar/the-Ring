"use client";

import { Mic } from "lucide-react";
import { useTranslations } from "next-intl";

import type { TimelineMessage } from "@pulse/core/timeline";

import { useAudioPlayed } from "../hooks/useAudioPlayed";
import styles from "../media.module.css";

type Props = {
  message: TimelineMessage;
  currentUserId: string;
};

function PlayedMic({ message }: { message: TimelineMessage }) {
  const t = useTranslations("media");
  const played = useAudioPlayed(message.id, message.status !== "pending");
  const label = played ? t("audioPlayed") : t("audioNotPlayed");
  return (
    <span
      className={styles.audioBadge}
      data-played={played ? "true" : "false"}
      title={label}
      aria-label={label}
      role="img"
    >
      <Mic size={14} aria-hidden />
    </span>
  );
}

/** Mic beside the delivery ticks on own voice notes: grey until a peer plays it. */
export function AudioPlayedBadge({ message, currentUserId }: Props) {
  if (message.type !== "audio" || message.sender_id !== currentUserId) {
    return null;
  }
  return <PlayedMic message={message} />;
}
