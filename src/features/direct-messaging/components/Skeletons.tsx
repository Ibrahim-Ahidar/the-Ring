"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";

import styles from "../direct-messaging.module.css";

/**
 * Placeholders painted where the chat list or a thread's messages will appear
 * while they stream in from the server. The surrounding pane (headers, search,
 * composer) is real and usable meanwhile.
 */

const ROW_WIDTHS = ["62%", "48%", "71%", "55%", "66%", "44%", "58%", "69%"];

function ChatListSkeletonInner() {
  const t = useTranslations("direct-messaging");
  return (
    <div className={styles.listSkeleton} role="status" aria-busy="true" aria-label={t("loadingChats")}>
      {ROW_WIDTHS.map((width, i) => (
        <div key={i} className={styles.skeletonRow} aria-hidden="true">
          <span className="skeleton skeleton--circle" style={{ inlineSize: 48, blockSize: 48 }} />
          <span className={styles.skeletonRowText}>
            <span className="skeleton skeleton--bar" style={{ inlineSize: i % 2 ? "38%" : "46%", blockSize: 14 }} />
            <span className="skeleton skeleton--bar" style={{ inlineSize: width, blockSize: 12 }} />
          </span>
        </div>
      ))}
    </div>
  );
}

export const ChatListSkeleton = memo(ChatListSkeletonInner);

const BUBBLES: { side: "in" | "out"; width: string }[] = [
  { side: "in", width: "42%" },
  { side: "out", width: "36%" },
  { side: "in", width: "58%" },
  { side: "in", width: "28%" },
  { side: "out", width: "50%" },
  { side: "out", width: "32%" },
  { side: "in", width: "46%" },
  { side: "out", width: "40%" },
];

function ThreadSkeletonInner() {
  const t = useTranslations("direct-messaging");
  return (
    <div className={styles.threadSkeleton} role="status" aria-busy="true" aria-label={t("loadingMessages")}>
      {BUBBLES.map((bubble, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`skeleton ${styles.bubbleSkeleton}`}
          data-side={bubble.side}
          style={{ inlineSize: bubble.width }}
        />
      ))}
    </div>
  );
}

export const ThreadSkeleton = memo(ThreadSkeletonInner);
