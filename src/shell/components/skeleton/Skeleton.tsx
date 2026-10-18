import type { CSSProperties, ReactNode } from "react";
import { getTranslations } from "next-intl/server";

import { PaneLayout } from "../PaneLayout";
import ui from "@/shell/styles/ui.module.css";
import styles from "./skeleton.module.css";

/**
 * Server-component skeleton primitives. Painting (shimmer, reduced motion, RTL
 * sweep) comes from the global `.skeleton` classes; these add structure and
 * reuse the real pages' layout classes, so a skeleton block takes the same
 * space as the content that replaces it.
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

export function SkeletonCircle({ size = 48, className }: { size?: Size; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`skeleton skeleton--circle ${className ?? ""}`}
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

/**
 * One line of text: the box is the real line height (`fontSize` x the body's
 * 1.45) so rows stack to the same height as text, with a slimmer bar inside.
 * `fontSize` is any CSS length, e.g. "var(--text-sm)".
 */
export function SkeletonLine({
  width = "100%",
  fontSize = "var(--text-md)",
  className,
}: {
  width?: Size;
  fontSize?: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.line} ${className ?? ""}`}
      style={{ blockSize: `calc(${fontSize} * 1.45)` }}
    >
      <SkeletonBar width={width} height={`calc(${fontSize} * 0.8)`} />
    </span>
  );
}

/** A 40px icon-button slot holding a 24px glyph circle, like `ui.iconBtn`. */
export function SkeletonIconButton({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`${styles.iconSlot} ${className ?? ""}`}>
      <SkeletonCircle size={24} />
    </span>
  );
}

/** Avatar + two text lines, the shape of a member/contact row (`ui.memberRow`). */
export function SkeletonListRow({ index = 0, avatar = 40 }: { index?: number; avatar?: number }) {
  return (
    <div className={`${styles.row} ${styles.listRow}`} aria-hidden="true">
      <SkeletonCircle size={avatar} />
      <span className={styles.listRowBody}>
        <SkeletonLine width={index % 2 ? "34%" : "42%"} />
        <SkeletonLine width={`${24 + ((index * 13) % 20)}%`} fontSize="var(--text-sm)" />
      </span>
    </div>
  );
}

export function SkeletonListRows({ count = 8, avatar }: { count?: number; avatar?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonListRow key={i} index={i} avatar={avatar} />
      ))}
    </>
  );
}

/** Small accent heading above a list (`ui.sectionLabel`). */
export function SkeletonSectionLabel({ width = 96 }: { width?: Size }) {
  return (
    <div className={styles.sectionLabel} aria-hidden="true">
      <SkeletonLine width={width} fontSize="var(--text-sm)" />
    </div>
  );
}

/** Label + 44px input (88px when `tall`, like a textarea), the shape of a `ui.field`. */
export function SkeletonField({ hint = false, tall = false }: { hint?: boolean; tall?: boolean }) {
  return (
    <div className={ui.field} aria-hidden="true">
      <SkeletonLine width={96} fontSize="var(--text-sm)" />
      <SkeletonBlock className={tall ? `${styles.field} ${styles.fieldTall}` : styles.field} />
      {hint ? <SkeletonLine width="70%" fontSize="12px" /> : null}
    </div>
  );
}

/** Pill button (`ui.btn`, 40px); full width by default. */
export function SkeletonButton({ width = "100%" }: { width?: Size }) {
  return <SkeletonBlock className={styles.button} style={{ inlineSize: px(width) }} />;
}

/** A button on its own end-aligned row (`ui.dialogActions`). */
export function SkeletonActions({ width = 112 }: { width?: Size }) {
  return (
    <div className={ui.dialogActions} aria-hidden="true">
      <SkeletonButton width={width} />
    </div>
  );
}

/** A settings-style card: head (title + description) and `fields` labelled inputs. */
export function SkeletonCard({ fields = 2 }: { fields?: number }) {
  return (
    <div className={ui.settingsCard} aria-hidden="true">
      <div className={ui.settingsCardHead}>
        <span className={styles.cardHead}>
          <SkeletonLine width="34%" fontSize="var(--text-lg)" />
          <SkeletonLine width="62%" fontSize="var(--text-sm)" />
        </span>
      </div>
      <div className={ui.settingsCardBody}>
        {Array.from({ length: fields }, (_, i) => (
          <SkeletonField key={i} />
        ))}
      </div>
    </div>
  );
}

/** A card of icon + text rows (`ui.setting`), optionally under a title head. */
export function SkeletonRowsCard({ rows = 2, title = true }: { rows?: number; title?: boolean }) {
  return (
    <div className={ui.settingsCard} aria-hidden="true">
      {title ? (
        <div className={ui.settingsCardHead}>
          <SkeletonLine width={140} fontSize="var(--text-lg)" />
        </div>
      ) : null}
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={styles.settingRow}>
          <SkeletonCircle size={20} />
          <SkeletonLine width={`${40 + ((i * 17) % 25)}%`} />
        </div>
      ))}
    </div>
  );
}

/**
 * Avatar, name, subtitle lines and action pills, the shape of `ui.profileHero`.
 * `lines` lists the font size of each subtitle line (handle, presence, ...).
 */
export function SkeletonHero({ lines = ["var(--text-lg)"], actions = 1 }: { lines?: string[]; actions?: number }) {
  return (
    <div className={styles.hero} aria-hidden="true">
      <span className={`skeleton skeleton--circle ${styles.heroAvatar}`} />
      <SkeletonLine width={180} fontSize="var(--text-2xl)" />
      {lines.map((fontSize, i) => (
        <SkeletonLine key={i} width={i === 0 ? 120 : 200} fontSize={fontSize} />
      ))}
      {actions > 0 ? (
        <div className={styles.heroActions}>
          {Array.from({ length: actions }, (_, i) => (
            <SkeletonButton key={i} width={i === 0 ? 176 : 120} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Frame of a SinglePane page: the header (back arrow + title; a direct child of
 * the pane so it gets the same panel background and border) and the centred
 * column. The shell (nav rail / tab bar) is drawn by the app layout, not here.
 */
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
      <header className="pane-header" aria-hidden="true">
        <SkeletonIconButton />
        <span className="pane-header__title">
          <SkeletonBar width={160} height={20} />
        </span>
      </header>
      <SkeletonRegion label={t("loading")} className={styles.region}>
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

/** Frame of a SettingsSection page: title row (mobile back arrow + title) and the centred column of cards. */
export async function SettingsSectionSkeleton({ children }: { children: ReactNode }) {
  const t = await getTranslations("shell");
  return (
    <SkeletonRegion label={t("loading")} className={styles.region}>
      <div className={ui.settingsPage}>
        <div className={ui.settingsInner}>
          <div className={ui.settingsTitleRow} aria-hidden="true">
            <SkeletonIconButton className={styles.mobileOnly} />
            <SkeletonLine width={200} fontSize="var(--text-2xl)" />
          </div>
          {children}
        </div>
      </div>
    </SkeletonRegion>
  );
}
