import { SkeletonBar, SkeletonCircle, SkeletonRegion } from "@/shell/components/skeleton/Skeleton";

import styles from "../direct-messaging.module.css";

/**
 * Placeholders painted where the chat list or a thread's messages will appear
 * while they stream in from the server. The surrounding pane (headers, search,
 * composer) is real and usable meanwhile. Sync and hook-free so both server
 * `loading.tsx` files and client components can render them; callers pass the
 * translated label.
 */

const ROW_WIDTHS = ["62%", "48%", "71%", "55%", "66%", "44%", "58%", "69%"];

export function ChatListSkeleton({ label }: { label: string }) {
  return (
    <SkeletonRegion label={label} className={styles.listSkeleton}>
      {ROW_WIDTHS.map((width, i) => (
        <div key={i} className={styles.skeletonRow} aria-hidden="true">
          <SkeletonCircle size={48} />
          <span className={styles.skeletonRowText}>
            <SkeletonBar width={i % 2 ? "38%" : "46%"} height={14} />
            <SkeletonBar width={width} height={12} />
          </span>
        </div>
      ))}
    </SkeletonRegion>
  );
}

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

export function ThreadSkeleton({ label }: { label: string }) {
  return (
    <SkeletonRegion label={label} className={styles.threadSkeleton}>
      {BUBBLES.map((bubble, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`skeleton ${styles.bubbleSkeleton}`}
          data-side={bubble.side}
          style={{ inlineSize: bubble.width }}
        />
      ))}
    </SkeletonRegion>
  );
}
