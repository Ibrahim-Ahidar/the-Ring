"use client";

import Link from "next/link";
import { memo } from "react";

import type { SearchCard } from "../types";
import styles from "../discovery-contacts.module.css";
import { UserAvatar } from "./UserAvatar";

type SearchCardViewProps = {
  card: SearchCard;
  profileHref: (username: string) => string;
};

function SearchCardViewInner({ card, profileHref }: SearchCardViewProps) {
  return (
    <li className={styles.card}>
      <Link href={profileHref(card.username)} className={styles.cardLink}>
        <UserAvatar avatarUrl={card.avatarUrl} />
        <div className={styles.cardText}>
          <p className={styles.displayName}>{card.displayName ?? card.username}</p>
          <p className={styles.username}>@{card.username}</p>
          {card.bio ? <p className={styles.bio}>{card.bio}</p> : null}
        </div>
      </Link>
    </li>
  );
}

export const SearchCardView = memo(SearchCardViewInner);
