"use client";

import Link from "next/link";
import { memo } from "react";
import { useTranslations } from "next-intl";

import { SearchCardView } from "@/features/discovery-contacts/components/SearchCardView";
import { Avatar } from "@/shell/components/Avatar";
import ui from "@/shell/styles/ui.module.css";

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
        <section aria-labelledby="search-people-heading">
          <h2 id="search-people-heading" className={ui.sectionLabel}>
            {t("sections.people")}
          </h2>
          <ul className={ui.list}>
            <SearchCardView
              card={person}
              profileHref={(username) => `/app/profile/${username}`}
            />
          </ul>
        </section>
      ) : null}

      {conversations.length > 0 ? (
        <section aria-labelledby="search-conversations-heading">
          <h2 id="search-conversations-heading" className={ui.sectionLabel}>
            {t("sections.conversations")}
          </h2>
          <ul className={ui.list}>
            {conversations.map((hit) => {
              const title =
                hit.title ??
                (hit.peerUsername ? `@${hit.peerUsername}` : t("conversationFallback"));
              return (
                <li key={hit.id}>
                  <Link href={conversationHref(hit)} className={ui.memberRow}>
                    <Avatar name={title} seed={hit.id} size="md" />
                    <span className={ui.memberRowBody}>
                      <span className={`${ui.memberRowName} bidi-auto`}>{title}</span>
                      {hit.type === "direct" && hit.peerUsername ? (
                        <span className={`${ui.memberRowAbout} handle`}>
                          @{hit.peerUsername}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {messages.length > 0 ? (
        <section aria-labelledby="search-messages-heading">
          <h2 id="search-messages-heading" className={ui.sectionLabel}>
            {t("sections.messages")}
          </h2>
          <ul className={ui.list}>
            {messages.map((hit) => {
              const title = hit.conversationTitle ?? t("conversationFallback");
              return (
                <li key={hit.messageId}>
                  <Link
                    href={messageHref(hit.conversationId, hit.messageId)}
                    className={ui.memberRow}
                  >
                    <Avatar name={title} seed={hit.conversationId} size="md" />
                    <span className={ui.memberRowBody}>
                      <span className={`${ui.memberRowName} bidi-auto`}>{title}</span>
                      <span className={`${ui.memberRowAbout} ${styles.snippet}`}>
                        <SnippetHighlight
                          snippet={hit.snippet}
                          matchStart={hit.matchStart}
                          queryLength={queryLength}
                          markClassName={ui.mark}
                        />
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </>
  );
}

export const SearchResultRows = memo(SearchResultRowsInner);
