import { getTranslations } from "next-intl/server";

import { ChatsPageSkeleton } from "@/features/direct-messaging/components/Skeletons";

export default async function Loading() {
  const t = await getTranslations("direct-messaging");
  return <ChatsPageSkeleton listLabel={t("loadingChats")} sidebarLabel={t("listLabel")} />;
}
