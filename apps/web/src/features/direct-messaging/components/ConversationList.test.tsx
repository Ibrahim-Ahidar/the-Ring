// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Pin } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "../messages/en.json";

const run = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("next/link", () => ({
  default: ({ children, prefetch, ...rest }: Record<string, unknown>) => (
    <a data-prefetch={String(prefetch)} {...(rest as object)}>{children as never}</a>
  ),
}));
vi.mock("../hooks/useQueryHref", () => ({ useQueryHref: () => (href: string) => href }));
vi.mock("../context/LoadingContext", () => ({
  useChatsLoading: () => ({ inbox: false, inboxFailed: false }),
}));
vi.mock("../context/MessagingProvider", () => ({
  useMessaging: () => ({
    state: {
      receiptsByConversation: {},
      conversations: [
        {
          id: "c1",
          type: "direct",
          title: null,
          other_user_id: "u2",
          other_display_name: "Sara",
          other_username: "sara",
          other_avatar_url: null,
          last_message_at: null,
          last_message_preview: "hi",
          last_message_deletion_scope: null,
          unread_count: 0,
          pinned_at: null,
          muted_until: null,
          archived_at: null,
        },
      ],
    },
  }),
}));
vi.mock("@/shell/slots", () => ({
  getContributions: () => [
    {
      id: "pin",
      order: 1,
      labelKey: "direct-messaging.pinned",
      icon: Pin,
      isAvailable: () => true,
      run,
    },
  ],
}));

import { ConversationList } from "./ConversationList";

function renderList() {
  render(
    <NextIntlClientProvider
      locale="en"
      messages={{ "direct-messaging": en } as never}
    >
      <ConversationList />
    </NextIntlClientProvider>,
  );
  return screen.getByRole("link");
}

beforeEach(() => {
  vi.useFakeTimers();
  run.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const touch = { pointerType: "touch", clientX: 10, clientY: 10 };

describe("ConversationList row actions", () => {
  it("opens the actions sheet after a 500 ms touch press and swallows the click", () => {
    const row = renderList();
    fireEvent.pointerDown(row, touch);
    act(() => void vi.advanceTimersByTime(499));
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => void vi.advanceTimersByTime(1));
    expect(screen.getByRole("dialog")).toBeTruthy();
    const click = fireEvent.click(row);
    expect(click).toBe(false);
  });

  it("cancels when the pointer moves or the gesture is cancelled by scrolling", () => {
    const row = renderList();
    fireEvent.pointerDown(row, touch);
    fireEvent.pointerMove(row, { ...touch, clientY: 40 });
    act(() => void vi.advanceTimersByTime(600));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.pointerDown(row, touch);
    fireEvent.pointerCancel(row, touch);
    act(() => void vi.advanceTimersByTime(600));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens on right-click and on Shift+F10", () => {
    const row = renderList();
    fireEvent.contextMenu(row);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.keyDown(row, { key: "F10", shiftKey: true });
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("opens the menu at the cursor on right-click, with the options listed straight away", () => {
    const row = renderList();
    fireEvent.contextMenu(row, { clientX: 123, clientY: 45 });
    const dialog = screen.getByRole("dialog");
    expect(dialog.style.left).not.toBe("");
    expect(dialog.style.top).not.toBe("");
    expect(parseFloat(dialog.style.left)).toBeGreaterThan(100);
    expect(parseFloat(dialog.style.top)).toBeGreaterThan(40);
    expect(within(dialog).getByRole("menuitem", { name: /pinned/i })).toBeTruthy();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("lists the options straight away after a long press, with no header or close step", () => {
    const row = renderList();
    fireEvent.pointerDown(row, touch);
    act(() => void vi.advanceTimersByTime(500));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getAllByRole("menuitem").length).toBeGreaterThan(0);
    expect(within(dialog).queryByRole("heading")).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /close/i })).toBeNull();
  });

  it("runs an action from the sheet and closes it", () => {
    const row = renderList();
    fireEvent.contextMenu(row);
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("menuitem", { name: /pinned/i }));
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
