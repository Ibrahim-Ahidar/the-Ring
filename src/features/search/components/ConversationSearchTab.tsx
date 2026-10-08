"use client";

import Link from "next/link";
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useTranslations } from "next-intl";

import { searchConversationAction } from "../actions";
import { searchErrorKey } from "../error-message";
import type { MessageSearchHit } from "../types";
import { SnippetHighlight } from "../SnippetHighlight";
import styles from "../search.module.css";

const DEBOUNCE_MS = 300;

type Props = {
  conversationId: string;
};

function messageHref(conversationId: string, messageId: string): string {
  return `/app/chats/${conversationId}?message=${messageId}`;
}

function ConversationSearchTabInner({ conversationId }: Props) {
  const t = useTranslations("search");
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageSearchHit[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSearch = useCallback(
    async (raw: string, cursor?: string | null) => {
      const trimmed = raw.trim();
      if (trimmed.length < 2) {
        setMessages([]);
        setHasMore(false);
        setNextCursor(null);
        setErrorCode(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorCode(null);
      const result = await searchConversationAction({
        conversationId,
        query: trimmed,
        cursor: cursor ?? null,
      });
      setLoading(false);
      if (!result.ok) {
        setErrorCode(result.error.code);
        return;
      }
      setMessages((prev) =>
        cursor ? [...prev, ...result.value.messages] : result.value.messages,
      );
      setHasMore(result.value.hasMore);
      setNextCursor(result.value.nextCursor);
    },
    [conversationId],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const onQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      void runSearch(value);
    }, DEBOUNCE_MS);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    void runSearch(query);
  };

  const trimmed = query.trim();
  const showEmpty =
    open && trimmed.length >= 2 && !loading && !errorCode && messages.length === 0;

  return (
    <div>
      <button
        type="button"
        className={styles.tabButton}
        data-active={open ? "true" : "false"}
        aria-expanded={open}
        aria-controls={`${fieldId}-panel`}
        onClick={() => setOpen((value) => !value)}
      >
        {t("threadTabLabel")}
      </button>
      {open ? (
        <div id={`${fieldId}-panel`} className={styles.panel}>
          <form onSubmit={onSubmit}>
            <div className={styles.searchField}>
              <label htmlFor={fieldId}>{t("threadFieldLabel")}</label>
              <input
                id={fieldId}
                className={styles.searchInput}
                type="search"
                value={query}
                autoComplete="off"
                onChange={(event) => onQueryChange(event.target.value)}
              />
            </div>
            <button type="submit" className={styles.searchButton}>
              {t("submit")}
            </button>
          </form>
          {loading ? <p>{t("loading")}</p> : null}
          {errorCode ? (
            <p className={styles.error} role="alert">
              {t(searchErrorKey(errorCode))}
            </p>
          ) : null}
          {showEmpty ? <p className={styles.empty}>{t("empty")}</p> : null}
          {messages.length > 0 ? (
            <ul className={styles.list}>
              {messages.map((hit) => (
                <li key={hit.messageId}>
                  <Link
                    href={messageHref(hit.conversationId, hit.messageId)}
                    className={styles.rowLink}
                  >
                    <p className={styles.snippet}>
                      <SnippetHighlight
                        snippet={hit.snippet}
                        matchStart={hit.matchStart}
                        queryLength={trimmed.length}
                      />
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {hasMore ? (
            <button
              type="button"
              className={styles.searchButton}
              disabled={loading}
              onClick={() => void runSearch(query, nextCursor)}
            >
              {t("loadMore")}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export const ConversationSearchTab = memo(ConversationSearchTabInner);
