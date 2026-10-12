"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { type ReactNode } from "react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

type PaneHeaderProps = {
  title: string;
  titleId?: string;
  /** Heading level; sidebar headers are the page h1, main-pane headers h2. */
  as?: "h1" | "h2";
  /** Back target. Defaults to the chat list; pass `null` to hide the back arrow. */
  backHref?: string | null;
  backLabel?: string;
  /** Replaces the back arrow (for example the profile avatar on the chat list). */
  leading?: ReactNode;
  actions?: ReactNode;
};

function PaneHeaderInner({
  title,
  titleId,
  as: Heading = "h1",
  backHref = "/app/chats",
  backLabel,
  leading,
  actions,
}: PaneHeaderProps) {
  const t = useTranslations("shell.nav");

  return (
    <header className="pane-header">
      {leading ??
        (backHref ? (
          <Link
            href={backHref}
            className={ui.iconBtn}
            aria-label={backLabel ?? t("backToChats")}
            title={backLabel ?? t("backToChats")}
          >
            <ArrowLeft size={24} className="flip-rtl" aria-hidden />
          </Link>
        ) : null)}
      <Heading className="pane-header__title" id={titleId}>
        {title}
      </Heading>
      {actions ? <div className="pane-header__actions">{actions}</div> : null}
    </header>
  );
}

export const PaneHeader = PaneHeaderInner;
