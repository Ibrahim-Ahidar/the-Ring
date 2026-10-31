"use client";

import { useTranslations } from "next-intl";

import type { TimelineMessage } from "@pulse/core/timeline";

import { getEncryptedMediaRef, useEncryptedMedia } from "../hooks/useEncryptedMedia";
import styles from "../media.module.css";

type Props = { message: TimelineMessage; currentUserId: string };

/** Decrypted view of an end-to-end encrypted media message (e2ee flag on). */
export function EncryptedMediaView({ message }: Props) {
  const t = useTranslations("media");
  const state = useEncryptedMedia(message);
  const ref = getEncryptedMediaRef(message);

  if (state.status === "expired" || state.status === "failed") {
    return (
      <span className={styles.missing} role="status" data-media-state={state.status}>
        {t(state.status === "expired" ? "mediaExpired" : "mediaDownloadFailed")}
      </span>
    );
  }

  if (message.type === "image") {
    const src = state.status === "ready" ? state.url : state.thumbUrl;
    const aspect = ref?.width && ref?.height ? { aspectRatio: `${ref.width} / ${ref.height}` } : undefined;
    return (
      <figure className={styles.imageFrame} style={aspect}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={ref?.fileName ?? t("imageAlt")}
            width={ref?.width ?? undefined}
            height={ref?.height ?? undefined}
          />
        ) : (
          <span className="sr-only">{t("loadingImage")}</span>
        )}
      </figure>
    );
  }

  if (state.status !== "ready") return <span className="sr-only">{t("loadingImage")}</span>;
  if (message.type === "audio") return <audio controls src={state.url} />;
  return (
    <a href={state.url} download={ref?.fileName ?? "file"}>
      {ref?.fileName ?? ref?.mimeType}
    </a>
  );
}
