import { getTranslations } from "next-intl/server";

import { ChatListSkeleton } from "@/features/direct-messaging/components/Skeletons";

export default async function Loading() {
  const t = await getTranslations("direct-messaging");
  return <ChatListSkeleton label={t("loadingChats")} />;
}
