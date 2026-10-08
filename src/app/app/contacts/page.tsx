import { getTranslations } from "next-intl/server";

import { ContactsPageView } from "@/features/discovery-contacts/components/ContactsPageView";
import {
  listFavorites,
  listRecentSearches,
} from "@/features/discovery-contacts/service";
import { getSessionContext } from "@/platform/session";

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
    <div className="route-frame">
      <h1 className="route-frame-title">{t("contacts")}</h1>
      <ContactsPageView initialRecents={recents} initialFavorites={favorites} />
    </div>
  );
}
