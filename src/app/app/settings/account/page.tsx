import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { AccountSettings } from "@/features/identity/components/AccountSettings";
import styles from "@/features/identity/identity.module.css";
import * as identity from "@/features/identity/service";
import { getSessionContext } from "@/platform/session";

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
    <div className={styles.stack}>
      <h1 className="route-frame-title">{t("accountTitle")}</h1>
      <AccountSettings profile={profileResult.value} />
    </div>
  );
}
