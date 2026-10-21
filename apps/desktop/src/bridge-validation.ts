export const MAX_ID = 128;
export const MAX_TITLE = 200;
export const MAX_BODY = 500;
export const MAX_UNREAD = 99999;

export type NotifyPayload = { chatId: string; title: string; body: string };

function str(v: unknown, max: number, allowEmpty: boolean): string | null {
  if (typeof v !== "string" || v.length > max) return null;
  if (!allowEmpty && v.length === 0) return null;
  return v;
}

/** Validates an untrusted notify payload from the renderer; null when invalid. */
export function parseNotifyPayload(raw: unknown): NotifyPayload | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const chatId = str(r.chatId, MAX_ID, false);
  const title = str(r.title, MAX_TITLE, false);
  const body = str(r.body, MAX_BODY, true);
  if (chatId === null || title === null || body === null) return null;
  return { chatId, title, body };
}

/** Validates an unread count: a non-negative integer, capped; null when invalid. */
export function parseUnreadCount(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) return null;
  return Math.min(raw, MAX_UNREAD);
}

/** Tray tooltip for an unread count. */
export function trayTooltip(count: number): string {
  return count > 0 ? `Pulse (${count} unread)` : "Pulse";
}
