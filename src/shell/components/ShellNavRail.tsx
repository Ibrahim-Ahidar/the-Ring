"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Home,
  MessageCircle,
  Search,
  Settings,
  UserRound,
  Users,
} from "lucide-react";
import { memo, useMemo, type ComponentType } from "react";
import { useTranslations } from "next-intl";

import { getContributions } from "@/shell/slots";

type ShellNavItem = {
  id: string;
  href: string;
  label: string;
  icon: typeof Home;
  badge?: ComponentType;
};

function ShellNavRailInner() {
  const pathname = usePathname();
  const t = useTranslations("shell.nav");
  const tFeature = useTranslations();

  const featureNav = useMemo(() => getContributions("nav"), []);

  const shellItems: ShellNavItem[] = useMemo(
    () => [
      { id: "home", href: "/app", label: t("home"), icon: Home },
      { id: "chats", href: "/app/chats", label: t("chats"), icon: MessageCircle },
      { id: "groups", href: "/app/groups", label: t("groups"), icon: Users },
      { id: "search", href: "/app/search", label: t("search"), icon: Search },
      {
        id: "contacts",
        href: "/app/contacts",
        label: t("contacts"),
        icon: UserRound,
      },
      {
        id: "notifications",
        href: "/app/notifications",
        label: t("notifications"),
        icon: Bell,
      },
      {
        id: "settings",
        href: "/app/settings/account",
        label: t("settings"),
        icon: Settings,
      },
    ],
    [t],
  );

  const merged = useMemo(() => {
    const fromFeatures: ShellNavItem[] = featureNav.map((item) => ({
      id: item.id,
      href: item.href,
      label: tFeature(item.labelKey!),
      icon: item.icon,
      badge: item.badge,
    }));
    const byId = new Map<string, ShellNavItem>();
    for (const item of [...shellItems, ...fromFeatures]) {
      byId.set(item.id, item);
    }
    return [...byId.values()];
  }, [featureNav, shellItems, tFeature]);

  return (
    <nav className="shell-nav" aria-label={t("home")}>
      {merged.map((item) => {
        const Icon = item.icon;
        const Badge = item.badge;
        const active =
          item.href === "/app"
            ? pathname === "/app"
            : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.id}
            href={item.href}
            className="shell-nav-link"
            data-active={active ? "true" : "false"}
            aria-label={item.label}
            title={item.label}
          >
            <Icon size={22} aria-hidden />
            {Badge ? <Badge /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

export const ShellNavRail = memo(ShellNavRailInner);
