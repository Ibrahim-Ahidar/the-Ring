"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useMemo } from "react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

export function backHrefForPath(pathname: string): string | null {
  if (!pathname.startsWith("/app/")) {
    return null;
  }
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length <= 2) {
    return segments[1] === "chats" ? null : "/app/chats";
  }
  return `/${segments.slice(0, -1).join("/")}`;
}

type Props = {
  /** Explicit target; otherwise the parent route of the current path. */
  href?: string;
  label?: string;
};

/**
 * Back arrow shown only on narrow screens, where one pane is visible at a time.
 * Sits at the start of a pane header (conversation header style).
 */
function MobileBackBarInner({ href, label }: Props) {
  const pathname = usePathname();
  const t = useTranslations("shell.nav");
  const derived = useMemo(() => backHrefForPath(pathname), [pathname]);
  const target = href ?? derived;

  if (!target) {
    return null;
  }

  const text = label ?? t("back");

  return (
    <Link
      href={target}
      className={`${ui.iconBtn} shell-back--mobile`}
      aria-label={text}
      title={text}
    >
      <ArrowLeft size={24} className="flip-rtl" aria-hidden />
    </Link>
  );
}

export const MobileBackBar = MobileBackBarInner;
