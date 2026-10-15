import { useSyncExternalStore } from "react";

export const TYPING_EXPIRE_MS = 4000;

export type TypingEntry = {
  userId: string;
  displayName: string;
  expiresAt: number;
};

export type TypingState = {
  typers: TypingEntry[];
};

export type TypingUser = { userId: string; displayName: string };

export type TypingReducerEvent =
  | { type: "started"; userId: string; displayName: string }
  | { type: "stopped"; userId: string }
  | { type: "expire"; now: number };

export const initialTypingState: TypingState = { typers: [] };

function pruneExpired(state: TypingState, now: number): TypingState {
  const typers = state.typers.filter((entry) => entry.expiresAt > now);
  return typers.length === state.typers.length ? state : { typers };
}

/** Pure reducer: returns the same state object when nothing changed. */
export function reduceTyping(
  state: TypingState,
  event: TypingReducerEvent,
  now: number,
  viewerId?: string,
): TypingState {
  const next = pruneExpired(state, now);

  if (event.type === "expire") {
    return pruneExpired(next, event.now);
  }

  if (event.type === "stopped") {
    if (viewerId && event.userId === viewerId) {
      return next;
    }
    const typers = next.typers.filter((entry) => entry.userId !== event.userId);
    return typers.length === next.typers.length ? next : { typers };
  }

  if (viewerId && event.userId === viewerId) {
    return next;
  }

  const expiresAt = now + TYPING_EXPIRE_MS;
  const existing = next.typers.find((entry) => entry.userId === event.userId);
  if (existing) {
    return {
      typers: next.typers.map((entry) =>
        entry.userId === event.userId
          ? { ...entry, displayName: event.displayName, expiresAt }
          : entry,
      ),
    };
  }

  return {
    typers: [
      ...next.typers,
      { userId: event.userId, displayName: event.displayName, expiresAt },
    ],
  };
}

export function visibleTypers(state: TypingState, now: number, viewerId?: string) {
  return reduceTyping(state, { type: "expire", now }, now, viewerId).typers.filter(
    (entry) => entry.userId !== viewerId,
  );
}

export function typerCount(state: TypingState, now: number, viewerId?: string): number {
  return visibleTypers(state, now, viewerId).length;
}

// ---- external store -------------------------------------------------------

const EMPTY: ReadonlyArray<TypingUser> = Object.freeze([]);

const states = new Map<string, TypingState>();
const listeners = new Map<string, Set<() => void>>();
const snapshots = new Map<
  string,
  { source: TypingState | undefined; list: ReadonlyArray<TypingUser> }
>();
let timer: ReturnType<typeof setTimeout> | null = null;

function emit(conversationId: string): void {
  const set = listeners.get(conversationId);
  if (set) {
    for (const listener of [...set]) {
      listener();
    }
  }
}

function store(conversationId: string, next: TypingState): boolean {
  const prev = states.get(conversationId);
  if (next.typers.length === 0) {
    if (!prev) {
      return false;
    }
    states.delete(conversationId);
    return true;
  }
  if (prev === next) {
    return false;
  }
  states.set(conversationId, next);
  return true;
}

function reschedule(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  let earliest = Infinity;
  for (const state of states.values()) {
    for (const entry of state.typers) {
      earliest = Math.min(earliest, entry.expiresAt);
    }
  }
  if (earliest === Infinity) {
    return;
  }
  timer = setTimeout(expireAll, Math.max(0, earliest - Date.now()));
}

function expireAll(): void {
  timer = null;
  const now = Date.now();
  const changed: string[] = [];
  for (const [conversationId, state] of [...states]) {
    if (store(conversationId, pruneExpired(state, now))) {
      changed.push(conversationId);
    }
  }
  reschedule();
  changed.forEach(emit);
}

export function setTypingEvent(
  conversationId: string,
  event: Exclude<TypingReducerEvent, { type: "expire" }>,
  now: number = Date.now(),
): void {
  const prev = states.get(conversationId) ?? initialTypingState;
  if (store(conversationId, reduceTyping(prev, event, now))) {
    reschedule();
    emit(conversationId);
  }
}

export function clearTyping(conversationId: string): void {
  if (store(conversationId, initialTypingState)) {
    reschedule();
    emit(conversationId);
  }
}

function subscribe(conversationId: string, listener: () => void): () => void {
  let set = listeners.get(conversationId);
  if (!set) {
    set = new Set();
    listeners.set(conversationId, set);
  }
  const mine = set;
  mine.add(listener);
  return () => {
    mine.delete(listener);
    if (mine.size === 0 && listeners.get(conversationId) === mine) {
      listeners.delete(conversationId);
    }
  };
}

function sameUsers(a: ReadonlyArray<TypingUser>, b: ReadonlyArray<TypingUser>) {
  return (
    a.length === b.length &&
    a.every(
      (user, i) => user.userId === b[i].userId && user.displayName === b[i].displayName,
    )
  );
}

function snapshotFor(
  conversationId: string,
  viewerId: string | undefined,
): ReadonlyArray<TypingUser> {
  const state = states.get(conversationId);
  const key = `${conversationId}|${viewerId ?? ""}`;
  const cached = snapshots.get(key);
  if (cached && cached.source === state) {
    return cached.list;
  }
  const list = (state?.typers ?? [])
    .filter((entry) => entry.userId !== viewerId)
    .map(({ userId, displayName }) => ({ userId, displayName }));
  const stable =
    cached && sameUsers(cached.list, list) ? cached.list : list.length ? list : EMPTY;
  snapshots.set(key, { source: state, list: stable });
  return stable;
}

/** Peers currently typing in a conversation; stable reference while unchanged. */
export function useTyping(
  conversationId: string,
  viewerId?: string | null,
): ReadonlyArray<TypingUser> {
  const viewer = viewerId ?? undefined;
  return useSyncExternalStore(
    (listener) => subscribe(conversationId, listener),
    () => snapshotFor(conversationId, viewer),
    () => EMPTY,
  );
}

/** Non-hook read, mainly for tests. */
export function getTyping(
  conversationId: string,
  viewerId?: string | null,
): ReadonlyArray<TypingUser> {
  return snapshotFor(conversationId, viewerId ?? undefined);
}

/** Test helper: drop all state and timers. */
export function resetTypingStoreForTests(): void {
  states.clear();
  snapshots.clear();
  listeners.clear();
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
}
