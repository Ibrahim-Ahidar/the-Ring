export type ShortcutDef = {
  id: string;
  key: string;
  mod: boolean;
  shift?: boolean;
  alt?: boolean;
  allowInField?: boolean;
};

export const GLOBAL_SHORTCUTS: readonly ShortcutDef[] = [
  { id: "palette", key: "k", mod: true, allowInField: true },
  { id: "chats", key: "1", mod: true, shift: true },
  { id: "settings", key: "3", mod: true, shift: true },
  { id: "help", key: "/", mod: true, shift: true },
] as const;

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }
  if (target.isContentEditable) {
    return true;
  }
  return false;
}

function modPressed(event: KeyboardEvent): boolean {
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/i.test(navigator.platform);
  return isMac ? event.metaKey : event.ctrlKey;
}

export function matchShortcut(
  event: KeyboardEvent,
  shortcut: ShortcutDef,
): boolean {
  if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) {
    return false;
  }
  if (shortcut.mod && !modPressed(event)) {
    return false;
  }
  if (!shortcut.mod && modPressed(event)) {
    return false;
  }
  if (Boolean(shortcut.shift) !== event.shiftKey) {
    return false;
  }
  if (Boolean(shortcut.alt) !== event.altKey) {
    return false;
  }
  return true;
}

export function findMatchingShortcut(
  event: KeyboardEvent,
): ShortcutDef | null {
  for (const shortcut of GLOBAL_SHORTCUTS) {
    if (!matchShortcut(event, shortcut)) {
      continue;
    }
    if (isTypingTarget(event.target) && !shortcut.allowInField) {
      continue;
    }
    return shortcut;
  }
  return null;
}

export function formatShortcutLabel(
  shortcut: ShortcutDef,
  isMac: boolean,
): string {
  const parts: string[] = [];
  if (shortcut.mod) {
    parts.push(isMac ? "⌘" : "Ctrl");
  }
  if (shortcut.shift) {
    parts.push(isMac ? "⇧" : "Shift");
  }
  if (shortcut.alt) {
    parts.push(isMac ? "⌥" : "Alt");
  }
  parts.push(shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key);
  return parts.join(isMac ? "" : "+");
}
