import type { NotificationCursor } from "./types";

export const NOTIFICATION_PAGE_SIZE = 30;

const CURSOR_SEPARATOR = "|";

export function encodeNotificationCursor(
  cursor: NotificationCursor,
): string {
  const payload = `${cursor.createdAt}${CURSOR_SEPARATOR}${cursor.id}`;
  return Buffer.from(payload, "utf8").toString("base64url");
}

export function decodeNotificationCursor(
  encoded: string,
): NotificationCursor | null {
  try {
    const payload = Buffer.from(encoded, "base64url").toString("utf8");
    const sep = payload.indexOf(CURSOR_SEPARATOR);
    if (sep <= 0) {
      return null;
    }
    const createdAt = payload.slice(0, sep);
    const id = payload.slice(sep + 1);
    if (!createdAt || !id) {
      return null;
    }
    return { createdAt, id };
  } catch {
    return null;
  }
}
