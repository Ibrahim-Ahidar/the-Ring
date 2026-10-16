import type { CSSProperties, ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { PaneLayout } from "../PaneLayout";
import ui from "@/shell/styles/ui.module.css";
import styles from "./skeleton.module.css";

/**
 * Server-component skeleton primitives. Painting (shimmer, reduced motion, RTL
 * sweep) comes from the global `.skeleton` classes; these add structure.
 * Everything here is sync and hook-free, so client components can use it too.
 */

type Size = number | string;

const px = (v: Size): string => (typeof v === "number" ? `${v}px` : v);

export function SkeletonBar({
  width = "100%",
  height = 14,
  className,
}: {
  width?: Size;
  height?: Size;
  className?: string;
}) {
  const style: CSSProperties = { inlineSize: px(width), blockSize: px(height) };
  return <span aria-hidden="true" className={`skeleton skeleton--bar ${className ?? ""}`} style={style} />;
}

export function SkeletonCircle({ size = 48 }: { size?: Size }) {
  return (
    <span
      aria-hidden="true"
      className="skeleton skeleton--circle"
      style={{ inlineSize: px(size), blockSize: px(size) }}
    />
  );
}

/** Block-level rectangle, e.g. a text field or media tile. */
export function SkeletonBlock({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden="true" className={`skeleton skeleton--bar ${className ?? ""}`} style={style} />;
}

/** Announces loading to assistive tech: aria-busy plus a visually hidden label. */
export function SkeletonRegion({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Avatar + two text lines, the shape of a list row. */
export function SkeletonListRow({ index = 0 }: { index?: number }) {
  return (
    <div className={`${styles.row} ${styles.listRow}`} aria-hidden="true">
      <SkeletonCircle />
      <span className={styles.stack} style={{ flex: 1 }}>
        <SkeletonBar width={index % 2 ? "38%" : "46%"} height={14} />
        <SkeletonBar width={`${44 + ((index * 13) % 28)}%`} height={12} />
      </span>
    </div>
  );
}

export function SkeletonListRows({ count = 8 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonListRow key={i} index={i} />
      ))}
    </>
  );
}

/** A settings-style card: title, optional description and `fields` input rows. */
export function SkeletonCard({ fields = 2 }: { fields?: number }) {
  return (
    <div className={styles.card} aria-hidden="true">
      <span className={styles.stack}>
        <SkeletonBar width="34%" height={18} />
        <SkeletonBar width="62%" height={12} />
      </span>
      {Array.from({ length: fields }, (_, i) => (
        <SkeletonBlock key={i} className={styles.field} />
      ))}
    </div>
  );
}

/** Frame of a SinglePane page: header (back arrow + title) and the centred column. */
export async function SinglePaneSkeleton({
  children,
  centred = true,
}: {
  children: ReactNode;
  centred?: boolean;
}) {
  const t = await getTranslations("shell");
  return (
    <PaneLayout view="main">
      <SkeletonRegion label={t("loading")} className={styles.region}>
        <header className="pane-header" aria-hidden="true">
          <SkeletonCircle size={40} />
          <SkeletonBar width={160} height={20} />
        </header>
        {centred ? (
          <div className={ui.settingsPage}>
            <div className={ui.settingsInner}>{children}</div>
          </div>
        ) : (
          <div className="pane-body scroll">{children}</div>
        )}
      </SkeletonRegion>
    </PaneLayout>
  );
}

/** Frame of a SettingsSection page: title row and the centred column of cards. */
export async function SettingsSectionSkeleton({ children }: { children: ReactNode }) {
  const t = await getTranslations("shell");
  return (
    <SkeletonRegion label={t("loading")} className={styles.region}>
      <div className={ui.settingsPage}>
        <div className={ui.settingsInner}>
          <div className={ui.settingsTitleRow} aria-hidden="true">
            <SkeletonBar width={200} height={32} />
          </div>
          {children}
        </div>
      </div>
    </SkeletonRegion>
  );
}
