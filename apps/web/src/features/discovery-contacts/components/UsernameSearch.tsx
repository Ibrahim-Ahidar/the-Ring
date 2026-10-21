"use client";

import { AtSign, Search } from "lucide-react";
import { memo, useCallback } from "react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

import { useDiscovery } from "../context/DiscoveryContext";
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
    <section aria-labelledby="discovery-search-heading">
      <h2 id="discovery-search-heading" className={ui.sectionLabel}>
        {t("search.title")}
      </h2>
      <form role="search" onSubmit={onSubmit}>
        <div className={ui.search}>
          <AtSign size={16} aria-hidden />
          <label className="sr-only" htmlFor="discovery-username-search">
            {t("search.label")}
          </label>
          <input
            id="discovery-username-search"
            type="search"
            name="username"
            autoComplete="off"
            spellCheck={false}
            value={state.query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("search.placeholder")}
          />
          <button
            type="submit"
            className={ui.iconBtn}
            disabled={state.searching}
            aria-label={t("search.submit")}
            title={t("search.submit")}
          >
            <Search size={16} aria-hidden />
          </button>
        </div>
      </form>
      {state.searchError ? (
        <p className={ui.errorText} role="alert">
          {state.searchError === "platform.rate_limited"
            ? t("errors.platform.rate_limited")
            : t("errors.generic")}
        </p>
      ) : null}
      {state.searching ? (
        <p className={ui.emptyInline} role="status">
          {t("search.loading")}
        </p>
      ) : null}
      {!state.searching && state.query.trim() && state.result === null ? (
        <p className={ui.emptyInline}>{t("search.noResult")}</p>
      ) : null}
      {state.result ? (
        <ul className={ui.list} aria-label={t("search.resultsLabel")}>
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
