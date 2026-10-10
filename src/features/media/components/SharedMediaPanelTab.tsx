"use client";

import { memo } from "react";
import Link from "next/link";
import { ChevronRight, Images } from "lucide-react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

type Props = {
  conversationId: string;
};

function SharedMediaPanelTabInner({ conversationId }: Props) {
  const t = useTranslations("media");

  return (
    <Link
      href={`/app/media/${conversationId}`}
      className={ui.listRow}
      aria-label={t("sharedMediaLink")}
    >
      <Images size={24} aria-hidden />
      <span className={ui.listRowBody}>
        <span className={ui.listRowTitle}>{t("sharedMedia")}</span>
      </span>
      <span className={ui.listRowTrail}>
        <ChevronRight size={16} className="flip-rtl" aria-hidden />
      </span>
    </Link>
  );
}

export const SharedMediaPanelTab = memo(SharedMediaPanelTabInner);
