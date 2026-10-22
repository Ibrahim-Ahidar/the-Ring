import type { DeviceSession } from "@/data";

/** Ports of the web identity session-display and device-label helpers. */
export type DeviceKind = "desktop" | "mobile" | "tablet";

const KIND_BY_OS: Record<string, DeviceKind> = {
  iPhone: "mobile",
  iPad: "tablet",
  Android: "mobile",
  ios: "mobile",
  android: "mobile",
  ChromeOS: "desktop",
  Windows: "desktop",
  macOS: "desktop",
  Linux: "desktop",
};

/** Parses a stored "<Browser> on <OS>" label back into its parts. */
export function describeDeviceLabel(label: string | null): { browser: string; os: string; kind: DeviceKind } | null {
  if (!label) return null;
  const at = label.lastIndexOf(" on ");
  if (at <= 0) return null;
  const browser = label.slice(0, at).trim();
  const os = label.slice(at + 4).trim();
  if (!browser || !os) return null;
  return { browser, os, kind: KIND_BY_OS[os] ?? "desktop" };
}

export function orderSessions(sessions: DeviceSession[], currentId: string | null): DeviceSession[] {
  const seen = (s: DeviceSession) => Date.parse(s.last_seen_at ?? s.created_at) || 0;
  return sessions
    .filter((s) => !s.revoked_at)
    .sort((a, b) => {
      if (a.id === currentId) return -1;
      if (b.id === currentId) return 1;
      return seen(b) - seen(a);
    });
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** null under a minute, relative within a week, otherwise a medium date. */
export function formatLastActive(iso: string | null, locale: string, now = Date.now()): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  const diff = now - at;
  if (diff < 60_000) return null;
  if (diff < 7 * 86_400_000) {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    for (const [unit, ms] of UNITS) {
      if (diff >= ms) return rtf.format(-Math.floor(diff / ms), unit);
    }
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(at);
}
