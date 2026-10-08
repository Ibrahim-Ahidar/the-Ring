const URL_PATTERN =
  /https?:\/\/[^\s<>"']+/gi;

export type TextSegment =
  | { kind: "text"; value: string }
  | { kind: "link"; href: string; label: string };

export function splitTextWithLinks(text: string): TextSegment[] {
  if (!text) {
    return [];
  }

  const segments: TextSegment[] = [];
  let lastIndex = 0;
  const matches = text.matchAll(URL_PATTERN);

  for (const match of matches) {
    const href = match[0];
    const index = match.index ?? 0;
    if (!isAllowedUrl(href)) {
      continue;
    }
    if (index > lastIndex) {
      segments.push({ kind: "text", value: text.slice(lastIndex, index) });
    }
    segments.push({ kind: "link", href, label: href });
    lastIndex = index + href.length;
  }

  if (lastIndex < text.length) {
    segments.push({ kind: "text", value: text.slice(lastIndex) });
  }

  if (segments.length === 0) {
    segments.push({ kind: "text", value: text });
  }

  return segments;
}

function isAllowedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
