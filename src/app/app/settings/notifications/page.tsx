import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { NotificationsSettingsForm } from "@/features/notifications/components/NotificationsSettingsForm";
import { getPreferences } from "@/features/notifications/service";
import { getSessionContext } from "@/platform/session";

export default async function SettingsNotificationsPage() {
  const session = await getSessionContext();
  if (!session) {
    redirect("/login");
  }

  const t = await getTranslations("notifications");
  const prefsResult = await getPreferences(session.rpc);
  const initial = prefsResult.ok
    ? prefsResult.value
    : {
        inAppEnabled: true,
        pushEnabled: false,
        mentionsOnly: false,
      };

  return (
    <div className="route-frame">
      <h1 className="route-frame-title">{t("settingsTitle")}</h1>
      <NotificationsSettingsForm initial={initial} />
    </div>
  );
}
