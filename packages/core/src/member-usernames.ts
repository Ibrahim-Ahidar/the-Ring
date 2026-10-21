/** Usernames typed as "@a, b c": trimmed, "@" stripped, de-duplicated (case-insensitive). */
export function parseMemberUsernames(raw: string | readonly string[]): string[] {
  const parts = typeof raw === "string" ? raw.split(/[\s,;]+/) : raw;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const username = part.trim().replace(/^@+/, "");
    const key = username.toLowerCase();
    if (!username || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(username);
  }
  return out;
}
