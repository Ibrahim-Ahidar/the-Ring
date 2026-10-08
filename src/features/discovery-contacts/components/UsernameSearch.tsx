"use client";

import { Search } from "lucide-react";
import { memo, useCallback } from "react";
import { useTranslations } from "next-intl";

import { useDiscovery } from "../context/DiscoveryContext";
import styles from "../discovery-contacts.module.css";
import { SearchCardView } from "./SearchCardView";

function UsernameSearchInner() {
  const t = useTranslations("discovery-contacts");
  const { state, setQuery, submitSearch } = useDiscovery();

  const onSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      void submitSearch();
    },
    [submitSearch],
  );

  return (
    <section className={styles.section} aria-labelledby="discovery-search-heading">
      <h2 id="discovery-search-heading" className={styles.sectionTitle}>
        {t("search.title")}
      </h2>
      <form className={styles.searchForm} onSubmit={onSubmit}>
        <div className={styles.searchField}>
          <label htmlFor="discovery-username-search">{t("search.label")}</label>
          <input
            id="discovery-username-search"
            type="search"
            name="username"
            autoComplete="off"
            className={styles.searchInput}
            value={state.query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search.placeholder")}
          />
        </div>
        <button
          type="submit"
          className={styles.searchButton}
          disabled={state.searching}
          aria-label={t("search.submit")}
        >
          <Search size={18} aria-hidden="true" />
          {t("search.submit")}
        </button>
      </form>
      {state.searchError ? (
        <p className={styles.error} role="alert">
          {state.searchError === "platform.rate_limited"
            ? t("errors.platform.rate_limited")
            : t("errors.generic")}
        </p>
      ) : null}
      {state.searching ? (
        <p className={styles.hint}>{t("search.loading")}</p>
      ) : null}
      {!state.searching && state.query.trim() && state.result === null ? (
        <p className={styles.noResult}>{t("search.noResult")}</p>
      ) : null}
      {state.result ? (
        <ul className={styles.list} aria-label={t("search.resultsLabel")}>
          <SearchCardView
            card={state.result}
            profileHref={(username) => `/app/profile/${username}`}
          />
        </ul>
      ) : null}
    </section>
  );
}

export const UsernameSearch = memo(UsernameSearchInner);
