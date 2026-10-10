"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ChevronRight,
  MessageCircle,
  Search,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { memo, useMemo, type ComponentType } from "react";
import { useTranslations } from "next-intl";

import { getContributions } from "@/shell/slots";
import ui from "@/shell/styles/ui.module.css";

type NavEntry = {
  id: string;
  href: string;
  label: string;
  icon: LucideIcon;
  order: number;
  badge?: ComponentType;
};

type Props = {
  /** Shell or feature nav ids to leave out (for example the page you are on). */
  exclude?: readonly string[];
};

/**
 * Destinations that used to live in the navigation rail, rendered as list rows.
 * Feature `nav` contributions still register here, including their badges.
 */
function ShellNavListInner({ exclude = [] }: Props) {
  const pathname = usePathname();
  const t = useTranslations("shell.nav");
  const tFeature = useTranslations();
  const featureNav = useMemo(() => getContributions("nav"), []);

  const entries = useMemo(() => {
    const shellItems: NavEntry[] = [
      { id: "chats", href: "/app/chats", label: t("chats"), icon: MessageCircle, order: 10 },
      { id: "groups", href: "/app/groups", label: t("groups"), icon: Users, order: 20 },
      { id: "search", href: "/app/search", label: t("search"), icon: Search, order: 30 },
      { id: "contacts", href: "/app/contacts", label: t("contacts"), icon: UserRound, order: 40 },
      {
        id: "notifications",
        href: "/app/notifications",
        label: t("notifications"),
        icon: Bell,
        order: 50,
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
    return [...byId.values()]
      .filter((item) => !exclude.includes(item.id))
      .sort((a, b) => a.order - b.order);
  }, [exclude, featureNav, t, tFeature]);

  return (
    <ul className={ui.list}>
      {entries.map((item) => {
        const Icon = item.icon;
        const Badge = item.badge;
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.id}>
            <Link
              href={item.href}
              className={ui.listRow}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={24} aria-hidden />
              <span className={ui.listRowBody}>
                <span className={ui.listRowTitle}>{item.label}</span>
              </span>
              <span className={ui.listRowTrail}>
                {Badge ? <Badge /> : null}
                <ChevronRight size={16} className="flip-rtl" aria-hidden />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export const ShellNavList = memo(ShellNavListInner);
