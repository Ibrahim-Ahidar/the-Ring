import { DRAFTS_STORAGE_KEY } from "./types";

const PERSIST_DEBOUNCE_MS = 400;

export type DraftStore = {
  get: (conversationId: string) => string;
  set: (conversationId: string, text: string) => void;
  subscribe: (listener: () => void) => () => void;
  /** Writes pending drafts to storage now. */
  flush: () => void;
  dispose: () => void;
};

function readStorage(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(DRAFTS_STORAGE_KEY);
    return raw ? ((JSON.parse(raw) as Record<string, string>) ?? {}) : {};
  } catch {
    return {};
  }
}

/**
 * Drafts live outside the reducer so a keystroke notifies only the composer
 * subscribed to that text; storage writes are debounced.
 */
export function createDraftStore(): DraftStore {
  let drafts: Record<string, string> | null = null;
  let dirty = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();

  const load = (): Record<string, string> => {
    if (drafts === null) {
      drafts = typeof window === "undefined" ? {} : readStorage();
    }
    return drafts;
  };

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!dirty || typeof window === "undefined") {
      return;
    }
    dirty = false;
    try {
      window.localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(load()));
    } catch {
      // Storage full or blocked: drafts just stay in memory.
    }
  };

  return {
    get: (id) => load()[id] ?? "",
    set: (id, text) => {
      const current = load();
      if ((current[id] ?? "") === text) {
        return;
      }
      drafts = { ...current, [id]: text };
      dirty = true;
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(flush, PERSIST_DEBOUNCE_MS);
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    flush,
    dispose: () => {
      flush();
      listeners.clear();
    },
  };
}
