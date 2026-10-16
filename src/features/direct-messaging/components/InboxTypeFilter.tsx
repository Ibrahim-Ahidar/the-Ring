"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

import { useQueryHref } from "../hooks/useQueryHref";

/**
 * "All / Groups" switch for the inbox. State lives in `?filter=groups`; the
 * links are client-side navigations inside the kept-alive chats layout, so the
 * inbox is not remounted.
 */
export function InboxTypeFilter() {
  const t = useTranslations("direct-messaging");
  const searchParams = useSearchParams();
  const queryHref = useQueryHref();
  const groupsOnly = searchParams.get("filter") === "groups";

  return (
    <div className={ui.chips} role="group" aria-label={t("typeFilter.label")}>
      <Link
        href={queryHref("/app/chats", { filter: null })}
        className={ui.chip}
        aria-pressed={!groupsOnly}
        scroll={false}
      >
        {t("typeFilter.all")}
      </Link>
      <Link
        href={queryHref("/app/chats", { filter: "groups" })}
        className={ui.chip}
        aria-pressed={groupsOnly}
        scroll={false}
      >
        {t("typeFilter.groups")}
      </Link>
    </div>
  );
}
