"use client";

import { memo, type ReactNode } from "react";

import { splitSnippetHighlight } from "./snippet-highlight";

type HighlightProps = {
  snippet: string;
  matchStart: number;
  queryLength: number;
  markClassName?: string;
};

function SnippetHighlightInner({
  snippet,
  matchStart,
  queryLength,
  markClassName,
}: HighlightProps) {
  const { before, match, after } = splitSnippetHighlight(
    snippet,
    matchStart,
    queryLength,
  );
  const nodes: ReactNode[] = [];
  if (before) {
    nodes.push(before);
  }
  if (match) {
    nodes.push(
      <mark key="m" className={markClassName}>
        {match}
      </mark>,
    );
  }
  if (after) {
    nodes.push(after);
  }
  return <>{nodes}</>;
}

export const SnippetHighlight = memo(SnippetHighlightInner);
