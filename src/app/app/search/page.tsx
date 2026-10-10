import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { GlobalSearchView } from "@/features/search/components/GlobalSearchView";
import { SearchProvider } from "@/features/search/context/SearchProvider";
import { getSessionContext } from "@/platform/session";
import { SinglePane } from "@/shell/components/SinglePane";

type PageProps = {
  searchParams: Promise<{ q?: string | string[] }>;
};

export default async function SearchPage({ searchParams }: PageProps) {
  const session = await getSessionContext();
  if (!session) {
    redirect("/login");
  }

  const query = await searchParams;
  const initialQuery = typeof query.q === "string" ? query.q : undefined;
  const t = await getTranslations("search");

  return (
    <SinglePane title={t("pageTitle")}>
      <SearchProvider>
        <GlobalSearchView initialQuery={initialQuery} />
      </SearchProvider>
    </SinglePane>
  );
}
