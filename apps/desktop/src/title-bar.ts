export const TITLE_BAR_HEIGHT = 36;

export type TitleBarColors = { color: string; symbolColor: string };

/** The desktop app opens on the signed-in app, never the marketing landing page. */
export function startUrl(base: string): string {
  return new URL("/app", base).toString();
}

/** True for the landing page ("/") on the Pulse origin. */
export function isLandingUrl(url: string, base: string): boolean {
  try {
    const u = new URL(url);
    return u.origin === new URL(base).origin && (u.pathname === "/" || u.pathname === "");
  } catch {
    return false;
  }
}

const RGB = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/;
const HEX = /^#[0-9a-f]{6}$/i;

function toHex(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 64) return null;
  const s = raw.trim();
  if (HEX.test(s)) return s.toLowerCase();
  const m = RGB.exec(s);
  if (!m) return null;
  const parts = m.slice(1, 4).map(Number);
  if (parts.some((n) => n > 255)) return null;
  return `#${parts.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}

/** Validates untrusted title bar colours from the renderer; null when invalid. */
export function parseTitleBarColors(raw: unknown): TitleBarColors | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { color, symbolColor } = raw as Record<string, unknown>;
  const c = toHex(color);
  const s = toHex(symbolColor);
  return c && s ? { color: c, symbolColor: s } : null;
}
