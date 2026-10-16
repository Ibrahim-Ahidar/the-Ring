"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  MessageCircle,
  Settings,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { memo, useMemo, type ComponentType } from "react";
import { useTranslations } from "next-intl";

import { getContributions } from "@/shell/slots";

type NavEntry = {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
  order: number;
  badge?: ComponentType;
};

/** Settings always sits last (bottom of the rail, end of the tab bar). */
const SETTINGS_ORDER = 1000;

function matches(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Id of the entry whose href is the longest prefix of the current path, so
 * `/app/chats/new` lights up New chat rather than Chats.
 */
export function activeNavId(
  pathname: string,
  entries: readonly { id: string; href: string }[],
): string | null {
  let best: { id: string; href: string } | null = null;
  for (const entry of entries) {
    if (matches(pathname, entry.href) && (!best || entry.href.length > best.href.length)) {
      best = entry;
    }
  }
  return best?.id ?? null;
}

/**
 * Primary app navigation: a vertical rail on desktop and a bottom tab bar on
 * mobile (layout lives in shell.css). Feature `nav` contributions register
 * here, including their badges, so they stay visible from every screen.
 */
function ShellNavListInner() {
  const pathname = usePathname() ?? "";
  const groupsFilter = useSearchParams()?.get("filter") === "groups";
  const t = useTranslations("shell.nav");
  const tFeature = useTranslations();
  const featureNav = useMemo(() => getContributions("nav"), []);

  const entries = useMemo(() => {
    const shellItems: NavEntry[] = [
      { id: "chats", href: "/app/chats", label: t("chats"), icon: MessageCircle, order: 10 },
      { id: "groups", href: "/app/chats?filter=groups", label: t("groups"), icon: Users, order: 20 },
      { id: "contacts", href: "/app/contacts", label: t("contacts"), icon: UserRound, order: 40 },
      {
        id: "settings",
        href: "/app/settings",
        label: t("settings"),
        icon: Settings,
        order: SETTINGS_ORDER,
      },
    ];
    const byId = new Map<string, NavEntry>();
    for (const item of shellItems) {
      byId.set(item.id, item);
    }
    for (const item of featureNav) {
      const existing = byId.get(item.id);
      byId.set(item.id, {
        id: item.id,
        href: item.href,
        label: tFeature(item.labelKey!),
        icon: item.icon,
        order: existing?.order ?? item.order,
        badge: item.badge,
      });
    }
    return [...byId.values()].sort((a, b) => a.order - b.order);
  }, [featureNav, t, tFeature]);

  // Groups is a filter of the chats inbox, so it shares the chats path.
  const activeId =
    pathname.startsWith("/app/groups/") ||
    (groupsFilter && (pathname === "/app/chats" || pathname.startsWith("/app/chats/")))
      ? entries.some((entry) => entry.id === "groups")
        ? "groups"
        : null
      : activeNavId(pathname, entries.filter((entry) => entry.id !== "groups"));

  return (
    <nav className="shell-nav" aria-label={t("primary")}>
      <ul className="shell-nav__list">
        {entries.map((item) => {
          const Icon = item.icon;
          const Badge = item.badge;
          const active = item.id === activeId;
          return (
            <li
              key={item.id}
              className="shell-nav__item"
              data-nav-id={item.id}
              data-end={item.order >= SETTINGS_ORDER ? "true" : undefined}
            >
              <Link
                href={item.href}
                className="shell-nav__link"
                title={item.label}
                aria-current={active ? "page" : undefined}
              >
                <span className="shell-nav__icon">
                  <Icon size={22} aria-hidden />
                  {Badge ? (
                    <span className="shell-nav__badge">
                      <Badge />
                    </span>
                  ) : null}
                </span>
                <span className="shell-nav__label">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export const ShellNavList = memo(ShellNavListInner);
