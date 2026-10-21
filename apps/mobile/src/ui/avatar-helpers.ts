/** Same algorithm as web avatarInitials. */
export function avatarInitials(name: string | null | undefined): string {
  const parts = (name ?? "")
    .trim()
    .replace(/^@/, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  const first = Array.from(parts[0]!)[0] ?? "";
  const last = parts.length > 1 ? (Array.from(parts[parts.length - 1]!)[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/** Same hash as web avatarColourIndex: stable 0-5 index per seed. */
export function avatarColourIndex(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 6;
}
