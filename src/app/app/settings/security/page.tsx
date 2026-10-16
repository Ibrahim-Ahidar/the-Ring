import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { SecuritySettings } from "@/features/identity/components/SecuritySettings";
import { readDeviceId } from "@/features/identity/device-cookie";
import * as identity from "@/features/identity/service";
import { getSessionContext } from "@/platform/session";
import { SettingsSection } from "@/shell/components/SettingsSection";
import { routeTitle } from "@/app/_public/route-title";

export const generateMetadata = routeTitle("settingsSecurity");

export default async function SettingsSecurityPage() {
  const ctx = await getSessionContext();
  if (!ctx) {
    redirect("/login");
  }

  const sessionsResult = await identity.listSessions(ctx.rpc);
  const sessions = sessionsResult.ok ? sessionsResult.value : [];
  const currentDeviceId = await readDeviceId();
  const factorsResult = await identity.listMfaFactors(ctx.supabase);
  const mfaFactors = factorsResult.ok ? factorsResult.value : [];

  const t = await getTranslations("identity");

  return (
    <SettingsSection title={t("securityTitle")}>
      <SecuritySettings
        sessions={sessions}
        currentDeviceId={currentDeviceId}
        mfaFactors={mfaFactors}
      />
    </SettingsSection>
  );
}
