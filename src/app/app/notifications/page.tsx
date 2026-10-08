import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { NotificationsInbox } from "@/features/notifications/components/NotificationsInbox";
import { NotificationsProvider } from "@/features/notifications/context/NotificationsContext";
import { getSessionContext } from "@/platform/session";

export default async function NotificationsPage() {
  const session = await getSessionContext();
  if (!session) {
    redirect("/login");
  }

  const t = await getTranslations("notifications");

  return (
    <div className="route-frame">
      <h1 className="route-frame-title">{t("pageTitle")}</h1>
      <NotificationsProvider userId={session.userId}>
        <NotificationsInbox />
      </NotificationsProvider>
    </div>
  );
}
