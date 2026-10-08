export function splitSnippetHighlight(
  snippet: string,
  matchStart: number,
  queryLength: number,
): { before: string; match: string; after: string } {
  const start = Math.max(0, Math.min(matchStart, snippet.length));
  const end = Math.min(snippet.length, start + Math.max(queryLength, 0));
  return {
    before: snippet.slice(0, start),
    match: snippet.slice(start, end),
    after: snippet.slice(end),
  };
}
