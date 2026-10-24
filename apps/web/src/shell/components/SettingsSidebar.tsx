"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronRight,
  Globe,
  KeyRound,
  Laptop,
  Lock,
  Palette,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { memo, useMemo, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";

import { isE2eeEnabled } from "@pulse/core";

import ui from "@/shell/styles/ui.module.css";
import { Avatar } from "./Avatar";
import { PaneHeader } from "./PaneHeader";

export type SettingsProfileSummary = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
};

type Props = {
  profile: SettingsProfileSummary | null;
  /** Sign-out control, owned by the identity feature. */
  footer?: ReactNode;
};

type Row = {
  href: string;
  icon: LucideIcon;
  title: string;
  desc: string;
};

const LOCALE_LABEL_KEY = {
  ar: "localeAr",
  en: "localeEn",
  fr: "localeFr",
} as const;

function SettingsSidebarInner({ profile, footer }: Props) {
  const pathname = usePathname();
  const locale = useLocale();
  const t = useTranslations("shell");
  const tLocale = useTranslations("locale-appearance");

  const rows = useMemo<Row[]>(
    () => [
      {
        href: "/app/settings/account",
        icon: UserRound,
        title: t("routes.settingsAccount"),
        desc: t("settings.accountDesc"),
      },
      {
        href: "/app/settings/privacy",
        icon: Lock,
        title: t("routes.settingsPrivacy"),
        desc: t("settings.privacyDesc"),
      },
      {
        href: "/app/settings/security",
        icon: KeyRound,
        title: t("routes.settingsSecurity"),
        desc: t("settings.securityDesc"),
      },
      ...(isE2eeEnabled()
        ? [
            {
              href: "/app/settings/devices",
              icon: Laptop,
              title: t("routes.settingsDevices"),
              desc: t("settings.devicesDesc"),
            },
          ]
        : []),
      {
        href: "/app/settings/appearance",
        icon: Palette,
        title: t("routes.settingsAppearance"),
        desc: t("settings.appearanceDesc"),
      },
      {
        href: "/app/settings/language",
        icon: Globe,
        title: t("routes.settingsLanguage"),
        desc: tLocale(LOCALE_LABEL_KEY[locale as keyof typeof LOCALE_LABEL_KEY] ?? "localeAr"),
      },
    ],
    [locale, t, tLocale],
  );

  const profileName = profile ? (profile.displayName ?? profile.username) : null;

  return (
    <>
      <PaneHeader title={t("settings.title")} />
      <div className="pane-body scroll">
        {profile ? (
          <Link href="/app/settings/account" className={ui.profileCard}>
            <Avatar name={profileName} seed={profile.id} src={profile.avatarUrl} size="lg" />
            <span className={ui.listRowBody}>
              <span className={ui.profileCardName}>{profileName}</span>
              <span className={`${ui.listRowSubtitle} truncate`}>
                <span className="handle">@{profile.username}</span>
                {profile.bio ? <span className="bidi-auto"> · {profile.bio}</span> : null}
              </span>
            </span>
          </Link>
        ) : null}

        <ul className={ui.list}>
          {rows.map((row) => {
            const Icon = row.icon;
            const active = pathname === row.href;
            return (
              <li key={row.href}>
                <Link
                  href={row.href}
                  className={ui.listRow}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon size={24} aria-hidden />
                  <span className={ui.listRowBody}>
                    <span className={ui.listRowTitle}>{row.title}</span>
                    <span className={ui.listRowSubtitle}>{row.desc}</span>
                  </span>
                  <span className={ui.listRowTrail}>
                    <ChevronRight size={16} className="flip-rtl" aria-hidden />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        {footer ? <div className={ui.list}>{footer}</div> : null}
      </div>
    </>
  );
}

export const SettingsSidebar = memo(SettingsSidebarInner);
