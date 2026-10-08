"use client";

import { memo } from "react";

import { splitTextWithLinks } from "../lib/linkify";
import styles from "../message-actions.module.css";

type Props = {
  text: string;
};

function LinkedTextInner({ text }: Props) {
  const segments = splitTextWithLinks(text);
  return (
    <span className={styles.linkedText}>
      {segments.map((segment, index) => {
        if (segment.kind === "text") {
          return <span key={index}>{segment.value}</span>;
        }
        return (
          <a
            key={index}
            href={segment.href}
            rel="noreferrer noopener"
            target="_blank"
            aria-label={segment.label}
          >
            {segment.label}
          </a>
        );
      })}
    </span>
  );
}

export const LinkedText = memo(LinkedTextInner);
