"use client";

import { memo } from "react";

import ui from "@/shell/styles/ui.module.css";

import { splitTextWithLinks } from "../lib/linkify";

type Props = {
  text: string;
};

function LinkedTextInner({ text }: Props) {
  const segments = splitTextWithLinks(text);
  return (
    <span className={ui.bubbleText}>
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
