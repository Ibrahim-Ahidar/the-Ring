import type { DeviceSession } from "./types";

const RELATIVE_UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

/** "5 minutes ago" within the last week, a date after that; null under a minute. */
export function formatLastActive(
  iso: string | null,
  locale: string,
  now: number = Date.now(),
): string | null {
  if (!iso) {
    return null;
  }
  const then = new Date(iso).getTime();
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) {
    return null;
  }
  if (seconds >= 7 * 86_400) {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(then);
  }
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const [unit, size] = RELATIVE_UNITS.find(([, s]) => seconds >= s)!;
  return rtf.format(-Math.floor(seconds / size), unit);
}

/** Active sessions only: the current device first, then most recently active. */
export function orderSessions(
  sessions: DeviceSession[],
  currentDeviceId: string | undefined,
): DeviceSession[] {
  return sessions
    .filter((s) => !s.revoked_at)
    .sort((a, b) => {
      if (a.id === currentDeviceId) return -1;
      if (b.id === currentDeviceId) return 1;
      const at = a.last_seen_at ?? a.created_at;
      const bt = b.last_seen_at ?? b.created_at;
      return bt.localeCompare(at);
    });
}
