// Client-only "marked as unread" flags (no server column yet). Stored per browser.
const KEY = "pulse.markedUnread";

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function isMarkedUnread(conversationId: string): boolean {
  return read().includes(conversationId);
}

export function setMarkedUnread(conversationId: string, value: boolean): void {
  try {
    const rest = read().filter((id) => id !== conversationId);
    window.localStorage.setItem(KEY, JSON.stringify(value ? [...rest, conversationId] : rest));
  } catch {
    // storage unavailable: flag is simply not remembered
  }
}
