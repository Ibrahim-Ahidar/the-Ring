import { getTranslations } from "next-intl/server";

import { ThreadSkeleton } from "@/features/direct-messaging/components/Skeletons";

export default async function Loading() {
  const t = await getTranslations("direct-messaging");
  return <ThreadSkeleton label={t("loadingMessages")} />;
}
