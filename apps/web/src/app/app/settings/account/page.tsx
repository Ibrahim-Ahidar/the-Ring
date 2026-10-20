import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AccountSettings } from "@/features/identity/components/AccountSettings";
import * as identity from "@/features/identity/service";
import { getSessionContext } from "@/platform/session";
import { SettingsSection } from "@/shell/components/SettingsSection";
import { routeTitle } from "@/app/_public/route-title";

export const generateMetadata = routeTitle("settingsAccount");

export default async function SettingsAccountPage() {
  const ctx = await getSessionContext();
  if (!ctx) {
    redirect("/login");
  }

  const profileResult = await identity.getOwnProfile(ctx.rpc);
  if (!profileResult.ok || !profileResult.value) {
    redirect("/login");
  }

  // Session claims can lag an email change; this page needs the live address.
  const { data: live } = await ctx.supabase.auth.getUser();
  const t = await getTranslations("identity");

  return (
    <SettingsSection title={t("accountTitle")}>
      <AccountSettings
        profile={profileResult.value}
        email={live.user?.email ?? ctx.user.email ?? ""}
        pendingEmail={live.user?.new_email ?? null}
      />
    </SettingsSection>
  );
}
