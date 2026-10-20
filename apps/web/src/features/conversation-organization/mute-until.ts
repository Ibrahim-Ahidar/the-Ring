import type { MuteDurationKey } from "./types";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function muteUntilForDuration(key: MuteDurationKey, now = Date.now()): string {
  switch (key) {
    case "1h":
      return new Date(now + HOUR_MS).toISOString();
    case "8h":
      return new Date(now + 8 * HOUR_MS).toISOString();
    case "24h":
      return new Date(now + DAY_MS).toISOString();
    case "7d":
      return new Date(now + 7 * DAY_MS).toISOString();
    case "forever":
      return new Date(now + 100 * 365.25 * DAY_MS).toISOString();
    default: {
      const _exhaustive: never = key;
      return _exhaustive;
    }
  }
}

export function isMuted(mutedUntil: string | null | undefined, now = Date.now()): boolean {
  if (!mutedUntil) {
    return false;
  }
  return new Date(mutedUntil).getTime() > now;
}
