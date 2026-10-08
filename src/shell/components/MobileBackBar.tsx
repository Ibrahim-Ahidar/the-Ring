"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { memo, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";

import { isRtl, type Locale } from "@/shell/locale";

function backHrefForPath(pathname: string): string | null {
  if (!pathname.startsWith("/app") || pathname === "/app") {
    return null;
  }

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length <= 1) {
    return null;
  }

  return `/${segments.slice(0, -1).join("/")}`;
}

function MobileBackBarInner() {
  const pathname = usePathname();
  const t = useTranslations("shell.nav");
  const locale = useLocale() as Locale;
  const backHref = useMemo(() => backHrefForPath(pathname), [pathname]);

  if (!backHref) {
    return null;
  }

  const BackIcon = isRtl(locale) ? ArrowRight : ArrowLeft;

  return (
    <div className="shell-mobile-bar">
      <Link
        href={backHref}
        className="shell-nav-link"
        aria-label={t("back")}
        data-active="false"
      >
        <BackIcon size={22} aria-hidden />
      </Link>
    </div>
  );
}

export const MobileBackBar = memo(MobileBackBarInner);
