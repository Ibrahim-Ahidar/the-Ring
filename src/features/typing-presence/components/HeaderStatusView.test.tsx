// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { act, cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetTypingStoreForTests, setTypingEvent } from "@/platform/typing-store";

import en from "../messages/en.json";

const ctx = vi.hoisted(() => ({
  value: {
    subjectPresence: null as unknown,
    subjectOnline: false,
    viewerId: "me" as string | null,
    conversationId: "c1",
  },
}));

vi.mock("@/features/typing-presence/context/typing-presence-context", () => ({
  useTypingPresence: () => ctx.value,
}));

import { HeaderStatusView } from "@/features/typing-presence/components/HeaderStatusView";

const row = (over: Record<string, unknown> = {}) => ({
  display_name: "Ada",
  last_seen_at: "2026-10-15T11:00:00.000Z",
  presence_allowed: true,
  show_last_seen: true,
  last_seen_visible: true,
  ...over,
});

function view(type: "direct" | "group" = "direct") {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ "typing-presence": en }}
      timeZone="UTC"
      now={new Date("2026-10-15T12:00:00.000Z")}
    >
      <HeaderStatusView conversationType={type} otherUserId="ada" />
    </NextIntlClientProvider>,
  );
}

describe("HeaderStatusView", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));
    resetTypingStoreForTests();
    ctx.value = {
      subjectPresence: row(),
      subjectOnline: false,
      viewerId: "me",
      conversationId: "c1",
    };
  });
  afterEach(() => {
    cleanup();
    resetTypingStoreForTests();
    vi.useRealTimers();
  });

  it("always renders a root span, for every kind", () => {
    const kinds: Array<[string, () => void]> = [
      ["none", () => (ctx.value.subjectPresence = null)],
      ["online", () => (ctx.value.subjectOnline = true)],
      ["lastSeen", () => undefined],
    ];
    for (const [kind, setup] of kinds) {
      setup();
      const { container, unmount } = view();
      const root = container.firstElementChild as HTMLElement;
      expect(root.tagName).toBe("SPAN");
      expect(root.dataset.kind).toBe(kind);
      unmount();
      ctx.value.subjectOnline = false;
      ctx.value.subjectPresence = row();
    }

    act(() => {
      setTypingEvent("c1", { type: "started", userId: "ada", displayName: "Ada" });
    });
    const { container } = view();
    expect((container.firstElementChild as HTMLElement).dataset.kind).toBe("typing");
  });

  it("reserves a fixed block size in CSS", () => {
    const css = readFileSync(
      join(__dirname, "HeaderStatusView.module.css"),
      "utf8",
    );
    expect(css).toMatch(/\.root\s*\{[^}]*min-block-size:\s*1\.25em/);
    expect(css).toMatch(/\.root\s*\{[^}]*line-height:\s*1\.25em/);
  });

  it("puts role=status only on the typing text", () => {
    ctx.value.subjectOnline = true;
    const online = view();
    expect(online.container.querySelector('[role="status"]')).toBeNull();
    online.unmount();

    act(() => {
      setTypingEvent("c1", { type: "started", userId: "ada", displayName: "Ada" });
    });
    const typing = view();
    const status = typing.container.querySelector('[role="status"]');
    expect(status?.textContent).toContain("typing…");
    expect(status?.getAttribute("aria-live")).toBe("polite");
  });

  it("uses the group typing messages", () => {
    act(() => {
      setTypingEvent("c1", { type: "started", userId: "ada", displayName: "Ada" });
    });
    const { container } = view("group");
    expect(container.textContent).toContain("Ada is typing");
  });

  it("shows a relative last seen and refreshes it every minute", () => {
    const { container } = view();
    expect(container.textContent).toMatch(/last seen 1 hour ago/);
    ctx.value.subjectPresence = row({ last_seen_at: "2026-10-15T11:59:50.000Z" });
    const second = view();
    expect(second.container.textContent).toContain("last seen just now");
  });

  it("falls back to a date after a week", () => {
    ctx.value.subjectPresence = row({ last_seen_at: "2026-09-01T11:00:00.000Z" });
    const { container } = view();
    expect(container.textContent).toMatch(/Last seen Sep 1, 2026/);
  });
});
