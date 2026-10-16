import { getTranslations } from "next-intl/server";

import { ContactsPageView } from "@/features/discovery-contacts/components/ContactsPageView";
import {
  listFavorites,
  listRecentSearches,
} from "@/features/discovery-contacts/service";
import { getSessionContext } from "@/platform/session";
import { LoadFailed } from "@/shell/components/LoadFailed";
import { SinglePane } from "@/shell/components/SinglePane";
import { routeTitle } from "@/app/_public/route-title";

export const generateMetadata = routeTitle("contacts");

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

  if (!recentsResult.ok && !favoritesResult.ok) {
    return (
      <SinglePane title={t("contacts")}>
        <LoadFailed />
      </SinglePane>
    );
  }

  return (
    <SinglePane title={t("contacts")}>
      <ContactsPageView initialRecents={recents} initialFavorites={favorites} />
    </SinglePane>
  );
}
