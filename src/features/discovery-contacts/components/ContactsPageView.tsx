"use client";

import { memo } from "react";

import { DiscoveryProvider } from "../context/DiscoveryContext";
import type { FavoriteContact, RecentSearch } from "../types";
import styles from "../discovery-contacts.module.css";
import { FavoritesList } from "./FavoritesList";
import { RecentSearches } from "./RecentSearches";
import { UsernameSearch } from "./UsernameSearch";

type ContactsPageViewProps = {
  initialRecents: RecentSearch[];
  initialFavorites: FavoriteContact[];
};

function ContactsPageViewInner({
  initialRecents,
  initialFavorites,
}: ContactsPageViewProps) {
  return (
    <DiscoveryProvider
      initialRecents={initialRecents}
      initialFavorites={initialFavorites}
    >
      <div className={styles.root}>
        <UsernameSearch />
        <FavoritesList />
        <RecentSearches />
      </div>
    </DiscoveryProvider>
  );
}

export const ContactsPageView = memo(ContactsPageViewInner);
