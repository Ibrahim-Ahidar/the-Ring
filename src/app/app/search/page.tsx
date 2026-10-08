import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { GlobalSearchView } from "@/features/search/components/GlobalSearchView";
import { SearchProvider } from "@/features/search/context/SearchProvider";
import { getSessionContext } from "@/platform/session";

export default async function SearchPage() {
  const session = await getSessionContext();
  if (!session) {
    redirect("/login");
  }

  const t = await getTranslations("search");

  return (
    <div className="route-frame">
      <h1 className="route-frame-title">{t("pageTitle")}</h1>
      <SearchProvider>
        <GlobalSearchView />
      </SearchProvider>
    </div>
  );
}
