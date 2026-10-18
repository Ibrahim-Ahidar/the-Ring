"use client";

import { memo, useState } from "react";

import ui from "@/shell/styles/ui.module.css";

import styles from "../direct-messaging.module.css";

type Props = {
  count: number;
  muted: boolean;
  label: string;
};

/**
 * Unread count pill. Pops (scale) when it first appears and when the count
 * goes up; a decrease does not animate. It stays mounted at 0 (renders
 * nothing) so a 0 → n change reads as an increase while the initial load does
 * not. The previous count is tracked per badge, so the list does not
 * re-render to drive the animation.
 */
export const UnreadBadge = memo(function UnreadBadge({ count, muted, label }: Props) {
  const [prev, setPrev] = useState(count);
  const [pops, setPops] = useState(0);
  if (count !== prev) {
    setPrev(count);
    if (count > prev) {
      setPops(pops + 1);
    }
  }

  if (count <= 0) {
    return null;
  }

  return (
    <span
      // A new key restarts the CSS animation on every increase.
      key={pops}
      className={`${ui.badge} ${muted ? ui.badgeMuted : ""} ${pops > 0 ? styles.badgePop : ""}`}
      data-pop={pops > 0 ? "true" : "false"}
      aria-label={label}
    >
      {count}
    </span>
  );
});
