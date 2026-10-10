import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { NotificationsInbox } from "@/features/notifications/components/NotificationsInbox";
import { NotificationsProvider } from "@/features/notifications/context/NotificationsContext";
import { getSessionContext } from "@/platform/session";
import { SinglePane } from "@/shell/components/SinglePane";

export default async function NotificationsPage() {
  const session = await getSessionContext();
  if (!session) {
    redirect("/login");
  }

  const t = await getTranslations("notifications");

  return (
    <SinglePane title={t("pageTitle")}>
      <NotificationsProvider userId={session.userId}>
        <NotificationsInbox />
      </NotificationsProvider>
    </SinglePane>
  );
}
