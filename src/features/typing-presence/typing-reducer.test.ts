import { describe, expect, it } from "vitest";

import {
  initialTypingState,
  reduceTyping,
  TYPING_EXPIRE_MS,
  typerCount,
  visibleTypers,
} from "@/features/typing-presence/typing-reducer";

describe("reduceTyping", () => {
  const viewerId = "viewer";
  const now = 1_000_000;

  it("shows a typer after started", () => {
    const next = reduceTyping(
      initialTypingState,
      { type: "started", userId: "a", displayName: "Ada" },
      now,
      viewerId,
    );
    expect(typerCount(next, now, viewerId)).toBe(1);
  });

  it("hides a typer after stopped", () => {
    let state = reduceTyping(
      initialTypingState,
      { type: "started", userId: "a", displayName: "Ada" },
      now,
      viewerId,
    );
    state = reduceTyping(
      state,
      { type: "stopped", userId: "a" },
      now + 100,
      viewerId,
    );
    expect(typerCount(state, now + 100, viewerId)).toBe(0);
  });

  it("expires a typer after four seconds without stop", () => {
    const started = reduceTyping(
      initialTypingState,
      { type: "started", userId: "a", displayName: "Ada" },
      now,
      viewerId,
    );
    const expired = reduceTyping(
      started,
      { type: "expire", now: now + TYPING_EXPIRE_MS + 1 },
      now + TYPING_EXPIRE_MS + 1,
      viewerId,
    );
    expect(typerCount(expired, now + TYPING_EXPIRE_MS + 1, viewerId)).toBe(0);
  });

  it("never shows the viewer as typing", () => {
    const next = reduceTyping(
      initialTypingState,
      { type: "started", userId: viewerId, displayName: "Me" },
      now,
      viewerId,
    );
    expect(visibleTypers(next, now, viewerId)).toEqual([]);
  });

  it("counts two typers without concatenating names", () => {
    let state = initialTypingState;
    state = reduceTyping(
      state,
      { type: "started", userId: "a", displayName: "Ada" },
      now,
      viewerId,
    );
    state = reduceTyping(
      state,
      { type: "started", userId: "b", displayName: "Ben" },
      now,
      viewerId,
    );
    expect(typerCount(state, now, viewerId)).toBe(2);
    const names = visibleTypers(state, now, viewerId).map((t) => t.displayName);
    expect(names.sort()).toEqual(["Ada", "Ben"]);
  });
});
