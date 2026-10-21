"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import { PaneLayout } from "./PaneLayout";
import { SettingsSidebar, type SettingsProfileSummary } from "./SettingsSidebar";

type Props = {
  profile: SettingsProfileSummary | null;
  signOut: ReactNode;
  children: ReactNode;
};

export function SettingsLayoutView({ profile, signOut, children }: Props) {
  const pathname = usePathname();
  const t = useTranslations("shell.settings");
  const onIndex = pathname === "/app/settings";

  return (
    <PaneLayout
      view={onIndex ? "list" : "main"}
      sidebar={<SettingsSidebar profile={profile} footer={signOut} />}
      sidebarLabel={t("title")}
    >
      {children}
    </PaneLayout>
  );
}
