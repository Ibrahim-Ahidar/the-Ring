"use client";

import Link from "next/link";
import { memo } from "react";

import { Avatar } from "@/shell/components/Avatar";
import ui from "@/shell/styles/ui.module.css";

import type { SearchCard } from "../types";

type SearchCardViewProps = {
  card: SearchCard;
  profileHref: (username: string) => string;
};

function SearchCardViewInner({ card, profileHref }: SearchCardViewProps) {
  const name = card.displayName ?? card.username;
  return (
    <li>
      <Link href={profileHref(card.username)} className={ui.memberRow}>
        <Avatar name={name} seed={card.id} src={card.avatarUrl} size="md" />
        <span className={ui.memberRowBody}>
          <span className={`${ui.memberRowName} bidi-auto`}>{name}</span>
          <span className={ui.memberRowAbout}>
            <span className="handle">@{card.username}</span>
            {card.bio ? <span className="bidi-auto"> · {card.bio}</span> : null}
          </span>
        </span>
      </Link>
    </li>
  );
}

export const SearchCardView = memo(SearchCardViewInner);
