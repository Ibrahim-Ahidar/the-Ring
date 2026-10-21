/** One-line preview of a message body for reply quotes. */
export function snippet(body: string | null | undefined, max = 80): string {
  const flat = (body ?? "").replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}
