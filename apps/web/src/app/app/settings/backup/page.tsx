import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { isE2eeEnabled } from "@pulse/core";

import { BackupSettings } from "@/features/backup/components/BackupSettings";
import { getSessionContext } from "@/platform/session";
import { SettingsSection } from "@/shell/components/SettingsSection";
import { routeTitle } from "@/app/_public/route-title";

export const generateMetadata = routeTitle("settingsBackup");

export default async function SettingsBackupPage() {
  if (!isE2eeEnabled()) {
    notFound();
  }
  const ctx = await getSessionContext();
  if (!ctx) {
    redirect("/login");
  }
  const t = await getTranslations("shell");

  return (
    <SettingsSection title={t("routes.settingsBackup")}>
      <BackupSettings />
    </SettingsSection>
  );
}
