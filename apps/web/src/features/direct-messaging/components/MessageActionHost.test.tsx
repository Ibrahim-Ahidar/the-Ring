// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Copy } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TimelineMessage } from "@pulse/core/timeline";

import en from "../messages/en.json";
import { MessageActionHost } from "./MessageActionHost";
import { computeMenuPosition } from "./menuPosition";

const available = { copy: true, del: true };
const makeAction = (
  id: string,
  labelKey: string,
  key: "copy" | "del",
  destructive = false,
) => ({
  id,
  feature: "message-actions",
  order: 10,
  labelKey,
  icon: Copy,
  destructive,
  isAvailable: () => available[key],
  run: vi.fn(),
});
const contributions = [
  makeAction("test-copy", "message-actions.actions.copy", "copy"),
  makeAction("test-delete", "message-actions.actions.deleteMe", "del", true),
  {
    ...makeAction("test-unpin", "message-actions.actions.unpin", "copy"),
    isAvailable: () => false,
  },
];
vi.mock("@/shell/slots", () => ({ getContributions: () => contributions }));

const message: TimelineMessage = {
  id: "msg-1",
  conversation_id: "conv-1",
  sender_id: "user-1",
  client_id: "client-1",
  type: "text",
  body: "Hello",
  reply_to_id: null,
  created_at: new Date().toISOString(),
  edited_at: null,
  deleted_at: null,
  deletion_scope: "none",
  pinned_at: null,
  forwarded: false,
  metadata: null,
};

const messages = {
  "direct-messaging": en,
  "message-actions": {
    actions: { copy: "Copy", deleteMe: "Delete for me", unpin: "Unpin" },
    reasons: { pending: "Still sending" },
  },
};

function renderHost() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MessageActionHost
        message={message}
        conversationId="conv-1"
        currentUserId="user-1"
        conversationType="direct"
      />
    </NextIntlClientProvider>,
  );
}

describe("MessageActionHost", () => {
  afterEach(() => {
    available.copy = true;
    available.del = true;
    cleanup();
  });

  describe("bubble long-press and context menu", () => {
    const menuOpen = () => screen.queryByRole("dialog") !== null;

    it("opens on touch long-press after 500 ms", () => {
      vi.useFakeTimers();
      try {
        const { container } = renderHost();
        const bubble = container;
        fireEvent.pointerDown(bubble, {
          pointerType: "touch",
          clientX: 5,
          clientY: 5,
        });
        act(() => {
          vi.advanceTimersByTime(499);
        });
        expect(menuOpen()).toBe(false);
        act(() => {
          vi.advanceTimersByTime(2);
        });
        expect(menuOpen()).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it("cancels the long-press when the finger moves", () => {
      vi.useFakeTimers();
      try {
        const { container } = renderHost();
        const bubble = container;
        fireEvent.pointerDown(bubble, {
          pointerType: "touch",
          clientX: 5,
          clientY: 5,
        });
        fireEvent.pointerMove(bubble, {
          pointerType: "touch",
          clientX: 5,
          clientY: 40,
        });
        act(() => {
          vi.advanceTimersByTime(800);
        });
        expect(menuOpen()).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it("opens on right-click and suppresses the native menu", () => {
      const { container } = renderHost();
      const bubble = container;
      const notPrevented = fireEvent.contextMenu(bubble);
      expect(notPrevented).toBe(false);
      expect(menuOpen()).toBe(true);
    });

    it("opens on Shift+F10", () => {
      const { container } = renderHost();
      fireEvent.keyDown(container, {
        key: "F10",
        shiftKey: true,
      });
      expect(menuOpen()).toBe(true);
    });
  });

  it("renders translated action labels", () => {
    renderHost();
    fireEvent.click(
      screen.getByRole("button", { name: en.messageActions, expanded: false }),
    );
    expect(screen.getByRole("menuitem", { name: "Copy" })).toBeTruthy();
    expect(
      screen.getByRole("menuitem", { name: "Delete for me" }),
    ).toBeTruthy();
  });

  it("renders only available actions, no disabled items", () => {
    renderHost();
    fireEvent.click(
      screen.getByRole("button", { name: en.messageActions, expanded: false }),
    );
    expect(screen.queryByRole("menuitem", { name: "Unpin" })).toBeNull();
    expect(screen.queryByText("Still sending")).toBeNull();
    expect(document.querySelector("button[disabled]")).toBeNull();
  });

  it("renders no trigger and leaves the native menu when nothing is available", () => {
    available.copy = false;
    available.del = false;
    const { container } = renderHost();
    expect(
      screen.queryByRole("button", { name: en.messageActions }),
    ).toBeNull();
    expect(fireEvent.contextMenu(container)).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("omits the divider when only one group has actions", () => {
    available.del = false;
    renderHost();
    fireEvent.click(
      screen.getByRole("button", { name: en.messageActions, expanded: false }),
    );
    expect(document.querySelector("hr")).toBeNull();
  });

  it("renders the menu in a portal on document.body", () => {
    const { container } = renderHost();
    fireEvent.click(
      screen.getByRole("button", { name: en.messageActions, expanded: false }),
    );
    const dialog = screen.getByRole("dialog");
    expect(container.contains(dialog)).toBe(false);
    expect(dialog.parentElement).toBe(document.body);
  });

  it("opening a second menu closes the first", () => {
    const first = renderHost();
    fireEvent.contextMenu(first.container);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const second = renderHost();
    fireEvent.contextMenu(second.container);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("closes on a right-click on the backdrop", () => {
    renderHost();
    fireEvent.click(
      screen.getByRole("button", { name: en.messageActions, expanded: false }),
    );
    const notPrevented = fireEvent.contextMenu(
      screen.getByRole("button", { name: en.closeActionMenu }),
    );
    expect(notPrevented).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes on Escape and restores focus to the trigger", () => {
    renderHost();
    const trigger = screen.getByRole("button", {
      name: en.messageActions,
      expanded: false,
    });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("computeMenuPosition", () => {
  const panel = { width: 200, height: 150 };
  const viewport = { width: 1000, height: 800 };
  const anchor = { top: 100, bottom: 130, left: 600, right: 630 };

  it("places below, end-aligned in LTR", () => {
    expect(computeMenuPosition(anchor, panel, viewport, "ltr")).toEqual({
      top: 134,
      left: 430,
      placement: "below",
    });
  });

  it("aligns to the start edge of the anchor in RTL", () => {
    expect(computeMenuPosition(anchor, panel, viewport, "rtl").left).toBe(600);
  });

  it("flips above when there is no room below", () => {
    const low = { top: 700, bottom: 730, left: 600, right: 630 };
    const result = computeMenuPosition(low, panel, viewport, "ltr");
    expect(result.placement).toBe("above");
    expect(result.top).toBe(700 - 4 - 150);
  });

  it("clamps to the viewport with an 8px margin", () => {
    const corner = { top: 10, bottom: 20, left: 0, right: 5 };
    const r = computeMenuPosition(corner, panel, viewport, "ltr");
    expect(r.left).toBe(8);
    const edge = computeMenuPosition(
      { ...anchor, left: 990, right: 1000 },
      panel,
      viewport,
      "rtl",
    );
    expect(edge.left).toBe(1000 - 200 - 8);
  });
});
