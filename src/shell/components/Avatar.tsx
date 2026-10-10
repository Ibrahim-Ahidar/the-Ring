import { memo, type ReactNode } from "react";

import ui from "@/shell/styles/ui.module.css";

export type AvatarSize = "xs" | "sm" | "md" | "default" | "lg" | "xl";

type AvatarProps = {
  /** Display name or username used for initials. */
  name: string | null | undefined;
  /** Stable id (user or conversation) that picks the fallback colour. */
  seed: string;
  /** Only absolute http(s) URLs are rendered; storage paths fall back to initials. */
  src?: string | null;
  size?: AvatarSize;
  className?: string;
  children?: ReactNode;
};

const SIZE_CLASS: Record<AvatarSize, string | undefined> = {
  xs: ui.avatarXs,
  sm: ui.avatarSm,
  md: ui.avatarMd,
  default: undefined,
  lg: ui.avatarLg,
  xl: ui.avatarXl,
};

const COLOUR_CLASSES = [
  ui.avatarC1,
  ui.avatarC2,
  ui.avatarC3,
  ui.avatarC4,
  ui.avatarC5,
  ui.avatarC6,
];

export function avatarInitials(name: string | null | undefined): string {
  const parts = (name ?? "")
    .trim()
    .replace(/^@/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  const first = Array.from(parts[0]!)[0] ?? "";
  const last = parts.length > 1 ? (Array.from(parts[parts.length - 1]!)[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

export function avatarColourIndex(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % COLOUR_CLASSES.length;
}

function isRenderableUrl(src: string | null | undefined): src is string {
  return typeof src === "string" && /^https?:\/\//.test(src);
}

function AvatarInner({
  name,
  seed,
  src,
  size = "default",
  className,
  children,
}: AvatarProps) {
  const classes = [
    ui.avatar,
    SIZE_CLASS[size],
    COLOUR_CLASSES[avatarColourIndex(seed)],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} aria-hidden="true">
      {isRenderableUrl(src) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" />
      ) : (
        avatarInitials(name)
      )}
      {children}
    </span>
  );
}

export const Avatar = memo(AvatarInner);
