import { describe, expect, it, vi } from "vitest";

import type { ConversationSummary } from "@/features/direct-messaging/types";

import {
  getDesktopBridge,
  newMessageNotifications,
  totalUnread,
  type DesktopBridge,
} from "./desktop-bridge";

function conv(over: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: "c1",
    type: "direct",
    title: null,
    last_message_at: null,
    last_message_id: "m1",
    last_message_preview: "hi",
    last_message_deletion_scope: null,
    unread_count: 0,
    pinned_at: null,
    archived_at: null,
    muted_until: null,
    other_user_id: "u2",
    other_username: "ann",
    other_display_name: "Ann",
    other_avatar_url: null,
    ...over,
  } as ConversationSummary;
}

const ctx = { activeConversationId: undefined, windowActive: true, now: 1000 };

describe("getDesktopBridge", () => {
  it("is null without a bridge", () => {
    expect(getDesktopBridge({})).toBeNull();
    expect(getDesktopBridge(undefined)).toBeNull();
  });
  it("returns the bridge when present", () => {
    const bridge: DesktopBridge = {
      version: "1",
      notify: vi.fn(),
      getLocalStorageKey: vi.fn(),
      setUnreadCount: vi.fn(),
      onOpenChat: vi.fn(),
    };
    expect(getDesktopBridge({ pulseDesktop: bridge })).toBe(bridge);
  });
});

describe("newMessageNotifications", () => {
  const prev = [conv()];
  const next = [conv({ last_message_id: "m2", unread_count: 1, last_message_preview: "yo" })];

  it("notifies for a new unread message", () => {
    expect(newMessageNotifications(prev, next, ctx)).toEqual([
      { chatId: "c1", title: "Ann", body: "yo" },
    ]);
  });
  it("does not notify on the first snapshot", () => {
    expect(newMessageNotifications(null, next, ctx)).toEqual([]);
  });
  it("skips the focused open chat but not when the window is inactive", () => {
    const open = { ...ctx, activeConversationId: "c1" };
    expect(newMessageNotifications(prev, next, open)).toEqual([]);
    expect(newMessageNotifications(prev, next, { ...open, windowActive: false })).toHaveLength(1);
  });
  it("skips muted and archived chats", () => {
    expect(
      newMessageNotifications(prev, [{ ...next[0], muted_until: new Date(5000).toISOString() }], ctx),
    ).toEqual([]);
    expect(
      newMessageNotifications(prev, [{ ...next[0], archived_at: "2020-01-01" }], ctx),
    ).toEqual([]);
  });
  it("ignores changes that are not new unread messages", () => {
    expect(newMessageNotifications(prev, prev, ctx)).toEqual([]);
    expect(
      newMessageNotifications(prev, [conv({ last_message_id: "m2", unread_count: 0 })], ctx),
    ).toEqual([]);
  });
});

describe("totalUnread", () => {
  it("sums chats and archived", () => {
    expect(
      totalUnread([conv({ unread_count: 2 }), conv({ id: "c2", unread_count: 3 })], {
        count: 1,
        unread: 4,
      }),
    ).toBe(9);
  });
});
