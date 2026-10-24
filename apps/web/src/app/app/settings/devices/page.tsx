import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { isE2eeEnabled } from "@pulse/core";

import { DevicesSettings } from "@/features/e2ee-devices/components/DevicesSettings";
import * as devices from "@/features/e2ee-devices/service";
import { getSessionContext } from "@/platform/session";
import { SettingsSection } from "@/shell/components/SettingsSection";
import { routeTitle } from "@/app/_public/route-title";

export const generateMetadata = routeTitle("settingsDevices");

export default async function SettingsDevicesPage() {
  if (!isE2eeEnabled()) {
    notFound();
  }
  const ctx = await getSessionContext();
  if (!ctx) {
    redirect("/login");
  }

  const result = await devices.listOwnDevices(ctx.rpc);
  const list = result.ok ? result.value : [];
  const t = await getTranslations("shell");

  return (
    <SettingsSection title={t("routes.settingsDevices")}>
      <DevicesSettings devices={list} />
    </SettingsSection>
  );
}
