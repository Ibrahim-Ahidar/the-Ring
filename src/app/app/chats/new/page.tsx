import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { NewChatClient } from "@/features/direct-messaging/components/NewChatClient";
import { getSessionContext } from "@/platform/session";
import { SinglePane } from "@/shell/components/SinglePane";

export default async function NewChatPage() {
  const session = await getSessionContext();
  if (!session) {
    redirect("/login");
  }

  const t = await getTranslations("direct-messaging");

  return (
    <SinglePane title={t("newChatTitle")}>
      <Suspense fallback={null}>
        <NewChatClient />
      </Suspense>
    </SinglePane>
  );
}
