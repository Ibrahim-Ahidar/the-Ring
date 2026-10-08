"use client";

import Link from "next/link";
import { memo } from "react";
import { useTranslations } from "next-intl";

import { SearchCardView } from "@/features/discovery-contacts/components/SearchCardView";

import type { ConversationSearchHit, MessageSearchHit } from "../types";
import { SnippetHighlight } from "../SnippetHighlight";
import styles from "../search.module.css";

type Props = {
  query: string;
  person: import("@/features/discovery-contacts/types").SearchCard | null;
  conversations: ConversationSearchHit[];
  messages: MessageSearchHit[];
};

function messageHref(conversationId: string, messageId: string): string {
  return `/app/chats/${conversationId}?message=${messageId}`;
}

function conversationHref(hit: ConversationSearchHit): string {
  return `/app/chats/${hit.id}`;
}

function SearchResultRowsInner({ query, person, conversations, messages }: Props) {
  const t = useTranslations("search");
  const queryLength = query.trim().length;

  return (
    <>
      {person ? (
        <section className={styles.section} aria-labelledby="search-people-heading">
          <h2 id="search-people-heading" className={styles.sectionTitle}>
            {t("sections.people")}
          </h2>
          <ul className={styles.list}>
            <SearchCardView
              card={person}
              profileHref={(username) => `/app/profile/${username}`}
            />
          </ul>
        </section>
      ) : null}

      {conversations.length > 0 ? (
        <section
          className={styles.section}
          aria-labelledby="search-conversations-heading"
        >
          <h2 id="search-conversations-heading" className={styles.sectionTitle}>
            {t("sections.conversations")}
          </h2>
          <ul className={styles.list}>
            {conversations.map((hit) => (
              <li key={hit.id}>
                <Link href={conversationHref(hit)} className={styles.rowLink}>
                  <p className={styles.rowTitle}>
                    {hit.title ??
                      (hit.peerUsername ? `@${hit.peerUsername}` : t("conversationFallback"))}
                  </p>
                  {hit.type === "direct" && hit.peerUsername ? (
                    <p className={styles.rowMeta}>@{hit.peerUsername}</p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {messages.length > 0 ? (
        <section className={styles.section} aria-labelledby="search-messages-heading">
          <h2 id="search-messages-heading" className={styles.sectionTitle}>
            {t("sections.messages")}
          </h2>
          <ul className={styles.list}>
            {messages.map((hit) => (
              <li key={hit.messageId}>
                <Link
                  href={messageHref(hit.conversationId, hit.messageId)}
                  className={styles.rowLink}
                >
                  {hit.conversationTitle ? (
                    <p className={styles.rowMeta}>{hit.conversationTitle}</p>
                  ) : null}
                  <p className={styles.snippet}>
                    <SnippetHighlight
                      snippet={hit.snippet}
                      matchStart={hit.matchStart}
                      queryLength={queryLength}
                    />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

export const SearchResultRows = memo(SearchResultRowsInner);
