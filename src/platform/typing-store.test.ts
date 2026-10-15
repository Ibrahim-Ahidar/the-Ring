import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  TYPING_EXPIRE_MS,
  clearTyping,
  getTyping,
  resetTypingStoreForTests,
  setTypingEvent,
} from "@/platform/typing-store";

describe("typing store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    resetTypingStoreForTests();
  });
  afterEach(() => {
    resetTypingStoreForTests();
    vi.useRealTimers();
  });

  it("filters the own viewer id at read time", () => {
    setTypingEvent("c1", { type: "started", userId: "me", displayName: "Me" });
    setTypingEvent("c1", { type: "started", userId: "ada", displayName: "Ada" });
    expect(getTyping("c1", "me")).toEqual([{ userId: "ada", displayName: "Ada" }]);
  });

  it("returns the same snapshot reference while nothing changed", () => {
    setTypingEvent("c1", { type: "started", userId: "ada", displayName: "Ada" });
    const first = getTyping("c1", "me");
    expect(getTyping("c1", "me")).toBe(first);
    // refreshing the same typer changes only expiry, not the visible list
    setTypingEvent("c1", { type: "started", userId: "ada", displayName: "Ada" });
    expect(getTyping("c1", "me")).toBe(first);
    expect(getTyping("other", "me")).toBe(getTyping("other", "me"));
  });

  it("removes on stopped", () => {
    setTypingEvent("c1", { type: "started", userId: "ada", displayName: "Ada" });
    setTypingEvent("c1", { type: "stopped", userId: "ada" });
    expect(getTyping("c1", "me")).toHaveLength(0);
  });

  it("expires after 4 s using a single timer", () => {
    setTypingEvent("c1", { type: "started", userId: "ada", displayName: "Ada" });
    setTypingEvent("c2", { type: "started", userId: "bob", displayName: "Bob" });
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(TYPING_EXPIRE_MS - 1);
    expect(getTyping("c1", "me")).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(getTyping("c1", "me")).toHaveLength(0);
    expect(getTyping("c2", "me")).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clearTyping empties a conversation and stops the timer", () => {
    setTypingEvent("c1", { type: "started", userId: "ada", displayName: "Ada" });
    clearTyping("c1");
    expect(getTyping("c1", "me")).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
