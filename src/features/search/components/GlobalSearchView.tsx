"use client";

import { memo, useEffect, useId, useRef } from "react";
import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

import { searchErrorKey } from "../error-message";
import { useSearch } from "../context/SearchProvider";
import { SearchResultRows } from "./SearchResultRows";
import styles from "../search.module.css";

type Props = {
  /** Query handed over from the chats sidebar (`/app/search?q=`). */
  initialQuery?: string;
};

function GlobalSearchViewInner({ initialQuery }: Props) {
  const t = useTranslations("search");
  const fieldId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const seededRef = useRef<string | null>(null);
  const { state, setQuery, submitSearch, loadMoreMessages } = useSearch();

  useEffect(() => {
    const seed = initialQuery?.trim();
    if (!seed || seededRef.current === seed) {
      return;
    }
    seededRef.current = seed;
    setQuery(seed);
  }, [initialQuery, setQuery]);

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
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          void submitSearch();
        }}
      >
        <div className={ui.search}>
          <button type="submit" className={ui.iconBtn} aria-label={t("submit")}>
            <Search size={16} aria-hidden />
          </button>
          <label className="sr-only" htmlFor={fieldId}>
            {t("fieldLabel")}
          </label>
          <input
            ref={inputRef}
            id={fieldId}
            type="search"
            name="q"
            value={state.query}
            autoComplete="off"
            placeholder={t("fieldLabel")}
            onChange={(event) => setQuery(event.target.value)}
            aria-describedby={state.errorCode ? "search-error" : undefined}
          />
          {state.query ? (
            <button
              type="button"
              className={ui.iconBtn}
              aria-label={t("clear")}
              title={t("clear")}
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
            >
              <X size={16} aria-hidden />
            </button>
          ) : null}
        </div>
      </form>

      {state.loading ? (
        <p className={ui.emptyInline} role="status">
          {t("loading")}
        </p>
      ) : null}
      {state.errorCode ? (
        <p id="search-error" className={ui.errorText} role="alert">
          {t(searchErrorKey(state.errorCode))}
        </p>
      ) : null}

      {showEmpty ? <p className={ui.emptyInline}>{t("empty")}</p> : null}

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
          className={`${ui.btn} ${ui.btnSecondary} ${styles.loadMore}`}
          disabled={state.loadingMore}
          onClick={() => void loadMoreMessages()}
        >
          {state.loadingMore ? t("loading") : t("loadMore")}
        </button>
      ) : null}

      <p className={ui.notice}>{t("exactUsernameHint")}</p>
    </div>
  );
}

export const GlobalSearchView = memo(GlobalSearchViewInner);
