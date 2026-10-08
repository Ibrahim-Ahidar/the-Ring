"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";

function SkipLinkInner() {
  const t = useTranslations("shell");

  return (
    <a href="#main-content" className="sr-only sr-only-focusable">
      {t("skipLink")}
    </a>
  );
}

export const SkipLink = memo(SkipLinkInner);
