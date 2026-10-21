import { useSyncExternalStore } from "react";

import {
  TYPING_EXPIRE_MS,
  pruneExpired,
  initialTypingState,
  reduceTyping,
  typerCount,
  visibleTypers,
  type TypingActivity,
  type TypingEntry,
  type TypingReducerEvent,
  type TypingState,
  type TypingUser,
} from "@pulse/core/typing";

export {
  TYPING_EXPIRE_MS,
  initialTypingState,
  reduceTyping,
  typerCount,
  visibleTypers,
  type TypingActivity,
  type TypingEntry,
  type TypingReducerEvent,
  type TypingState,
  type TypingUser,
};

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
      (user, i) => user.userId === b[i].userId &&
        user.displayName === b[i].displayName &&
        user.activity === b[i].activity,
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
    .map(({ userId, displayName, activity }) => ({
      userId,
      displayName,
      activity,
    }));
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
