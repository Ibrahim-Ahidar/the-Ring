// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  GLOBAL_SHORTCUTS,
  findMatchingShortcut,
  isTypingTarget,
  matchShortcut,
} from "@/features/locale-appearance/shortcuts";

describe("shortcuts", () => {
  it("matches palette toggle with mod+k", () => {
    const palette = GLOBAL_SHORTCUTS.find((s) => s.id === "palette")!;
    const event = {
      key: "k",
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      target: document.body,
    } as unknown as KeyboardEvent;
    expect(matchShortcut(event, palette)).toBe(true);
  });

  it("ignores navigation shortcuts while typing in inputs", () => {
    const input = document.createElement("input");
    const event = {
      key: "1",
      ctrlKey: true,
      metaKey: false,
      shiftKey: true,
      altKey: false,
      target: input,
    } as unknown as KeyboardEvent;
    expect(isTypingTarget(input)).toBe(true);
    expect(findMatchingShortcut(event)).toBeNull();
  });

  it("allows palette toggle while typing in inputs", () => {
    const input = document.createElement("input");
    const event = {
      key: "k",
      ctrlKey: true,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      target: input,
    } as unknown as KeyboardEvent;
    expect(findMatchingShortcut(event)?.id).toBe("palette");
  });
});
