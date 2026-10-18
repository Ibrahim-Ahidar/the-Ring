// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TimelineMessage } from "@/platform/timeline";

import ar from "../messages/ar.json";
import en from "../messages/en.json";
import { MessageTimeline } from "./MessageTimeline";

const loadOlderMessages = vi.fn();
let mockState: Record<string, unknown>;

vi.mock("../context/MessagingProvider", () => ({
  useMessaging: () => ({ state: mockState, retrySend: vi.fn(), clearLive: vi.fn(), loadOlderMessages }),
}));
vi.mock("../hooks/useReadReceipts", () => ({
  useReadTracker: () => () => () => {},
}));
vi.mock("@/features/groups/hooks/useGroupMemberNames", () => ({
  useGroupMemberDirectory: () => new Map(),
}));
vi.mock("./MessageBubble", () => ({
  MessageBubble: ({ message, live }: { message: TimelineMessage; live?: boolean }) => (
    <p data-live={live ? "true" : undefined}>{message.body}</p>
  ),
}));

let observerCallback: IntersectionObserverCallback | null = null;

class FakeObserver {
  constructor(cb: IntersectionObserverCallback) {
    observerCallback = cb;
  }
  observe() {}
  disconnect() {}
  unobserve() {}
  takeRecords() {
    return [];
  }
}

function msg(id: string, sender: string, at: string): TimelineMessage {
  return {
    id,
    conversation_id: "c1",
    sender_id: sender,
    client_id: id,
    type: "text",
    body: id,
    reply_to_id: null,
    created_at: at,
    edited_at: null,
    deleted_at: null,
    deletion_scope: "none",
    pinned_at: null,
    forwarded: false,
    metadata: null,
  } as TimelineMessage;
}

function makeState(messages: TimelineMessage[], hasMore = true, liveClientIds: Record<string, true> = {}) {
  return {
    messagesByConversation: { c1: messages },
    messagesHasMore: { c1: hasMore },
    pendingSends: [],
    unreadSeparatorByConversation: {},
    liveClientIds,
  };
}

function ui(locale: "en" | "ar" = "en") {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={{ "direct-messaging": locale === "en" ? en : ar }}
      timeZone="UTC"
    >
      <div dir={locale === "ar" ? "rtl" : "ltr"}>
        <MessageTimeline conversationId="c1" conversationType="direct" currentUserId="me" />
      </div>
    </NextIntlClientProvider>
  );
}

function setGeometry(node: HTMLElement, v: { scrollHeight: number; clientHeight: number }) {
  Object.defineProperty(node, "scrollHeight", { configurable: true, value: v.scrollHeight });
  Object.defineProperty(node, "clientHeight", { configurable: true, value: v.clientHeight });
}

const base = [msg("m2", "sara", "2026-01-01T10:00:00.000Z"), msg("m3", "sara", "2026-01-01T10:01:00.000Z")];

beforeEach(() => {
  loadOlderMessages.mockReset();
  observerCallback = null;
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  mockState = makeState([...base]);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MessageTimeline older pages", () => {
  it("loads automatically near the top, once, and shows a spinner", async () => {
    let resolve: () => void = () => {};
    loadOlderMessages.mockReturnValue(new Promise<void>((r) => (resolve = r)));
    render(ui());
    const entries = [{ isIntersecting: true }] as IntersectionObserverEntry[];
    act(() => observerCallback?.(entries, {} as IntersectionObserver));
    act(() => observerCallback?.(entries, {} as IntersectionObserver));
    fireEvent.click(screen.getByRole("button", { name: /Loading older messages|Load older/ }));
    expect(loadOlderMessages).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status", { name: "Loading older messages" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "Loading older messages" }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => resolve());
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("keeps the scroll anchor when older messages are prepended", async () => {
    let resolve: () => void = () => {};
    loadOlderMessages.mockReturnValue(new Promise<void>((r) => (resolve = r)));
    const { container, rerender } = render(ui());
    const log = container.querySelector('[role="log"]') as HTMLElement;
    setGeometry(log, { scrollHeight: 1000, clientHeight: 400 });
    log.scrollTop = 20;
    fireEvent.click(screen.getByRole("button", { name: "Load older messages" }));

    mockState = makeState([msg("m1", "sara", "2026-01-01T09:00:00.000Z"), ...base]);
    setGeometry(log, { scrollHeight: 1600, clientHeight: 400 });
    rerender(ui());
    await act(async () => resolve());
    expect(log.scrollTop).toBe(620);
  });
});

describe("MessageTimeline jump to latest", () => {
  it("shows a count when scrolled up and new messages arrive, hides at the bottom", () => {
    const { container, rerender } = render(ui());
    const log = container.querySelector('[role="log"]') as HTMLElement;
    setGeometry(log, { scrollHeight: 2000, clientHeight: 400 });
    expect(screen.queryByText(/Jump to latest|new message/)).toBeNull();

    log.scrollTop = 100;
    fireEvent.scroll(log);
    expect(screen.getByRole("button", { name: /Jump to latest/ })).toBeTruthy();

    mockState = makeState([...base, msg("m4", "sara", "2026-01-01T10:02:00.000Z"), msg("m5", "sara", "2026-01-01T10:03:00.000Z")]);
    rerender(ui());
    expect(screen.getByRole("button", { name: /2 new messages/ })).toBeTruthy();

    log.scrollTop = 1600;
    fireEvent.scroll(log);
    expect(screen.queryByText(/new message|Jump to latest/)).toBeNull();
  });

  it("scrolls to the bottom when clicked and works in RTL", () => {
    const { container } = render(ui("ar"));
    const log = container.querySelector('[role="log"]') as HTMLElement;
    const scrollTo = vi.fn();
    log.scrollTo = scrollTo as unknown as typeof log.scrollTo;
    setGeometry(log, { scrollHeight: 2000, clientHeight: 400 });
    log.scrollTop = 0;
    fireEvent.scroll(log);
    fireEvent.click(screen.getByRole("button", { name: /الانتقال إلى الأحدث/ }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 2000, behavior: "smooth" });
  });
});

describe("MessageTimeline live fade-up", () => {
  it("marks only live-flagged messages for the enter animation", () => {
    const items = [
      msg("m1", "sara", "2026-01-01T09:00:00.000Z"),
      msg("m2", "sara", "2026-01-01T09:01:00.000Z"),
    ];
    const height = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(60);
    mockState = makeState(items, false, { [items[1].client_id]: true });
    const { container } = render(ui());
    height.mockRestore();
    const live = container.querySelectorAll("[data-live='true']");
    expect(live.length).toBe(1);
    expect(live[0].textContent).toBe("m2");
  });
});

describe("MessageTimeline virtualization", () => {
  it("renders only a window of rows for a 2,000-message thread, in order", () => {
    const many = Array.from({ length: 2000 }, (_, i) =>
      msg(`m${String(i).padStart(4, "0")}`, "sara", new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString()),
    );
    // jsdom has no layout: give every row a real height so the window is bounded.
    const height = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(60);
    mockState = makeState(many, false);
    const { container } = render(ui());
    const rows = container.querySelectorAll("[data-index]");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThan(100);
    const indexes = Array.from(rows).map((r) => Number(r.getAttribute("data-index")));
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
    height.mockRestore();
  });
});
