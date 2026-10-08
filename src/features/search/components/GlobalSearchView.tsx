"use client";

import { memo, useId } from "react";
import { useTranslations } from "next-intl";

import { searchErrorKey } from "../error-message";
import { useSearch } from "../context/SearchProvider";
import { SearchResultRows } from "./SearchResultRows";
import styles from "../search.module.css";

function GlobalSearchViewInner() {
  const t = useTranslations("search");
  const fieldId = useId();
  const { state, setQuery, submitSearch, loadMoreMessages } = useSearch();

  const trimmed = state.query.trim();
  const hasResults =
    state.person !== null ||
    state.conversations.length > 0 ||
    state.messages.length > 0;
  const showEmpty =
    trimmed.length > 0 && !state.loading && !state.errorCode && !hasResults;

  return (
    <div className={styles.root}>
      <form
        className={styles.searchForm}
        onSubmit={(event) => {
          event.preventDefault();
          void submitSearch();
        }}
      >
        <div className={styles.searchField}>
          <label htmlFor={fieldId}>{t("fieldLabel")}</label>
          <input
            id={fieldId}
            className={styles.searchInput}
            type="search"
            name="q"
            value={state.query}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
            aria-describedby={state.errorCode ? "search-error" : undefined}
          />
        </div>
        <button type="submit" className={styles.searchButton}>
          {t("submit")}
        </button>
      </form>

      {state.loading ? <p>{t("loading")}</p> : null}
      {state.errorCode ? (
        <p id="search-error" className={styles.error} role="alert">
          {t(searchErrorKey(state.errorCode))}
        </p>
      ) : null}

      {showEmpty ? (
        <p className={styles.empty}>{t("empty")}</p>
      ) : null}

      {hasResults ? (
        <SearchResultRows
          query={state.query}
          person={state.person}
          conversations={state.conversations}
          messages={state.messages}
        />
      ) : null}

      {state.messagesHasMore ? (
        <button
          type="button"
          className={styles.searchButton}
          disabled={state.loadingMore}
          onClick={() => void loadMoreMessages()}
        >
          {state.loadingMore ? t("loading") : t("loadMore")}
        </button>
      ) : null}
    </div>
  );
}

export const GlobalSearchView = memo(GlobalSearchViewInner);
