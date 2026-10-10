import { getTranslations } from "next-intl/server";

import { ContactsPageView } from "@/features/discovery-contacts/components/ContactsPageView";
import {
  listFavorites,
  listRecentSearches,
} from "@/features/discovery-contacts/service";
import { getSessionContext } from "@/platform/session";
import { SinglePane } from "@/shell/components/SinglePane";

export default async function ContactsPage() {
  const session = await getSessionContext();
  const t = await getTranslations("shell.routes");

  if (!session) {
    return null;
  }

  const [recentsResult, favoritesResult] = await Promise.all([
    listRecentSearches(session.rpc),
    listFavorites(session.rpc),
  ]);

  const recents = recentsResult.ok ? recentsResult.value : [];
  const favorites = favoritesResult.ok ? favoritesResult.value : [];

  return (
    <SinglePane title={t("contacts")}>
      <ContactsPageView initialRecents={recents} initialFavorites={favorites} />
    </SinglePane>
  );
}
