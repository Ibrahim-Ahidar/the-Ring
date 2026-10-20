import { decodeBase64Url, encodeBase64Url } from "./base64url";

export const MESSAGE_PAGE_SIZE = 50;
export const CONVERSATION_PAGE_SIZE = 30;

export type MessageCursor = {
  createdAt: string;
  id: string;
};

const CURSOR_SEPARATOR = "|";

export function encodeMessageCursor(cursor: MessageCursor): string {
  const payload = `${cursor.createdAt}${CURSOR_SEPARATOR}${cursor.id}`;
  return encodeBase64Url(payload);
}

export function decodeMessageCursor(encoded: string): MessageCursor | null {
  try {
    const payload = decodeBase64Url(encoded);
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
