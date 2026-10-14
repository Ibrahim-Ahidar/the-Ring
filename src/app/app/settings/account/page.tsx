import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AccountSettings } from "@/features/identity/components/AccountSettings";
import * as identity from "@/features/identity/service";
import { getSessionContext } from "@/platform/session";
import { SettingsSection } from "@/shell/components/SettingsSection";

export default async function SettingsAccountPage() {
  const ctx = await getSessionContext();
  if (!ctx) {
    redirect("/login");
  }

  const profileResult = await identity.getOwnProfile(ctx.rpc);
  if (!profileResult.ok || !profileResult.value) {
    redirect("/login");
  }

  const t = await getTranslations("identity");

  return (
    <SettingsSection title={t("accountTitle")}>
      <AccountSettings
        profile={profileResult.value}
        email={ctx.user.email ?? ""}
        pendingEmail={ctx.user.new_email ?? null}
      />
    </SettingsSection>
  );
}
