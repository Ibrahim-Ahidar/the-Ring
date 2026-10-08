export const TYPING_EXPIRE_MS = 4000;

export type TypingEntry = {
  userId: string;
  displayName: string;
  expiresAt: number;
};

export type TypingState = {
  typers: TypingEntry[];
};

export type TypingReducerEvent =
  | {
      type: "started";
      userId: string;
      displayName: string;
    }
  | { type: "stopped"; userId: string }
  | { type: "expire"; now: number };

export const initialTypingState: TypingState = {
  typers: [],
};

function pruneExpired(state: TypingState, now: number): TypingState {
  const typers = state.typers.filter((entry) => entry.expiresAt > now);
  if (typers.length === state.typers.length) {
    return state;
  }
  return { typers };
}

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
    const typers = next.typers.map((entry) =>
      entry.userId === event.userId
        ? { ...entry, displayName: event.displayName, expiresAt }
        : entry,
    );
    return { typers };
  }

  return {
    typers: [
      ...next.typers,
      {
        userId: event.userId,
        displayName: event.displayName,
        expiresAt,
      },
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
