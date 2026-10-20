import { PaneLayout } from "@/shell/components/PaneLayout";
import {
  SkeletonBar,
  SkeletonCircle,
  SkeletonIconButton,
  SkeletonLine,
  SkeletonRegion,
} from "@/shell/components/skeleton/Skeleton";
import skeletonStyles from "@/shell/components/skeleton/skeleton.module.css";

import styles from "../direct-messaging.module.css";

/**
 * Placeholders painted where the chat list or a thread's messages will appear
 * while they stream in from the server. They reuse the real chat classes
 * (`chatRow` dimensions, `convHeader`, `messages`, `composer`) so nothing shifts
 * when the content arrives. Sync and hook-free so both server `loading.tsx`
 * files and client components can render them; callers pass the translated label.
 */

const ROW_WIDTHS = ["62%", "48%", "71%", "55%", "66%", "44%", "58%", "69%"];

/** One inbox row: 48px avatar, name + time, preview line (see `.chatRow`). */
function ChatRowSkeleton({ index }: { index: number }) {
  return (
    <div className={styles.skeletonRow} aria-hidden="true">
      <SkeletonCircle size={48} />
      <span className={styles.skeletonRowText}>
        <span className={styles.skeletonRowLine}>
          <SkeletonBar width={index % 2 ? "34%" : "44%"} height={18} />
          <SkeletonBar width={32} height={12} />
        </span>
        <SkeletonBar width={ROW_WIDTHS[index % ROW_WIDTHS.length]} height={14} />
      </span>
    </div>
  );
}

export function ChatListSkeleton({ label, count = ROW_WIDTHS.length }: { label: string; count?: number }) {
  return (
    <SkeletonRegion label={label} className={styles.listSkeleton}>
      {Array.from({ length: count }, (_, i) => (
        <ChatRowSkeleton key={i} index={i} />
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

function Bubbles() {
  return (
    <>
      {BUBBLES.map((bubble, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`skeleton ${styles.bubbleSkeleton}`}
          data-side={bubble.side}
          style={{ inlineSize: bubble.width }}
        />
      ))}
    </>
  );
}

/** Message bubbles only, for inside an already-rendered timeline. */
export function ThreadSkeleton({ label }: { label: string }) {
  return (
    <SkeletonRegion label={label} className={styles.threadSkeleton}>
      <Bubbles />
    </SkeletonRegion>
  );
}

/**
 * The whole open-conversation pane: header (back arrow on mobile, avatar,
 * title + subtitle, action buttons), message area and composer pill. Shown by
 * the conversation route while the thread's detail loads.
 */
export function ConversationSkeleton({ label }: { label: string }) {
  return (
    <SkeletonRegion label={label} className={styles.conversation}>
      <header className={styles.convHeader} aria-hidden="true">
        <SkeletonIconButton className={skeletonStyles.mobileOnly} />
        <div className={styles.convInfo}>
          <SkeletonCircle size={40} />
          <div className={styles.convInfoText}>
            <SkeletonLine width="32%" fontSize="var(--text-lg)" />
            <SkeletonLine width="18%" fontSize="var(--text-sm)" />
          </div>
        </div>
        <div className={styles.convActions}>
          <SkeletonIconButton />
          <SkeletonIconButton />
        </div>
      </header>
      <div className={`${styles.messages} ${styles.skeletonMessages}`}>
        <Bubbles />
      </div>
      <div className={styles.composer} aria-hidden="true">
        <div className={`${styles.composerBar} ${styles.skeletonComposerBar}`}>
          <SkeletonIconButton />
          <SkeletonBar width="100%" height={16} className={styles.skeletonComposerInput} />
          <SkeletonCircle size={40} />
        </div>
      </div>
    </SkeletonRegion>
  );
}

/**
 * Route-level fallback for /app/chats, shown while the chats layout resolves.
 * Mirrors the real sidebar (profile avatar, title, two action buttons, the
 * All/Groups chips, rows) so the list skeleton stays at the sidebar's width
 * instead of spanning the page. Narrow screens show the list pane, like the
 * real shell without an open chat.
 */
export function ChatsPageSkeleton({ listLabel, sidebarLabel }: { listLabel: string; sidebarLabel: string }) {
  return (
    <PaneLayout
      view="list"
      sidebarLabel={sidebarLabel}
      sidebar={
        <>
          <header className="pane-header" aria-hidden="true">
            <SkeletonCircle size={32} />
            <span className="pane-header__title">
              <SkeletonBar width={96} height={24} />
            </span>
            <div className="pane-header__actions">
              <SkeletonIconButton />
              <SkeletonIconButton />
            </div>
          </header>
          <div className="pane-tools" aria-hidden="true">
            <div className={skeletonStyles.chips}>
              <SkeletonBar width={48} height={32} className={skeletonStyles.pill} />
              <SkeletonBar width={76} height={32} className={skeletonStyles.pill} />
            </div>
          </div>
          <div className="pane-body" style={{ overflow: "hidden" }}>
            <ChatListSkeleton label={listLabel} count={12} />
          </div>
        </>
      }
    >
      {null}
    </PaneLayout>
  );
}
