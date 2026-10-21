export const TYPING_EXPIRE_MS = 4000;

export type TypingActivity = "typing" | "recording";

export type TypingEntry = {
  userId: string;
  displayName: string;
  activity: TypingActivity;
  expiresAt: number;
};

export type TypingState = {
  typers: TypingEntry[];
};

export type TypingUser = {
  userId: string;
  displayName: string;
  activity: TypingActivity;
};

export type TypingReducerEvent =
  | {
      type: "started";
      userId: string;
      displayName: string;
      /** Defaults to "typing". */
      activity?: TypingActivity;
    }
  | {
      type: "stopped";
      userId: string;
      /** When set, only clears an entry of this activity. */
      activity?: TypingActivity;
    }
  | { type: "expire"; now: number };

export const initialTypingState: TypingState = { typers: [] };

export function pruneExpired(state: TypingState, now: number): TypingState {
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
    const typers = next.typers.filter(
      (entry) =>
        entry.userId !== event.userId ||
        (event.activity !== undefined && entry.activity !== event.activity),
    );
    return typers.length === next.typers.length ? next : { typers };
  }

  if (viewerId && event.userId === viewerId) {
    return next;
  }

  const expiresAt = now + TYPING_EXPIRE_MS;
  const activity = event.activity ?? "typing";
  const existing = next.typers.find((entry) => entry.userId === event.userId);
  if (existing) {
    // Recording wins: typing pings do not downgrade a live recording entry.
    if (existing.activity === "recording" && activity === "typing") {
      return next;
    }
    return {
      typers: next.typers.map((entry) =>
        entry.userId === event.userId
          ? { ...entry, displayName: event.displayName, activity, expiresAt }
          : entry,
      ),
    };
  }

  return {
    typers: [
      ...next.typers,
      { userId: event.userId, displayName: event.displayName, activity, expiresAt },
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
