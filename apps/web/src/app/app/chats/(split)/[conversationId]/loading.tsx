import { getTranslations } from "next-intl/server";

import { ConversationSkeleton } from "@/features/direct-messaging/components/Skeletons";

export default async function Loading() {
  const t = await getTranslations("direct-messaging");
  return <ConversationSkeleton label={t("loadingMessages")} />;
}
