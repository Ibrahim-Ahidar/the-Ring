import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { SecuritySettings } from "@/features/identity/components/SecuritySettings";
import { readDeviceId } from "@/features/identity/device-cookie";
import styles from "@/features/identity/identity.module.css";
import * as identity from "@/features/identity/service";
import { getSessionContext } from "@/platform/session";

export default async function SettingsSecurityPage() {
  const ctx = await getSessionContext();
  if (!ctx) {
    redirect("/login");
  }

  const sessionsResult = await identity.listSessions(ctx.rpc);
  const sessions = sessionsResult.ok ? sessionsResult.value : [];
  const currentDeviceId = await readDeviceId();

  const t = await getTranslations("identity");

  return (
    <div className={styles.stack}>
      <h1 className="route-frame-title">{t("securityTitle")}</h1>
      <SecuritySettings
        sessions={sessions}
        currentDeviceId={currentDeviceId}
      />
    </div>
  );
}
