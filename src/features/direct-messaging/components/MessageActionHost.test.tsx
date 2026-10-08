// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { Copy, Trash2 } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TimelineMessage } from "@/platform/timeline";

import en from "../messages/en.json";
import { MessageActionHost } from "./MessageActionHost";

vi.mock("@/shell/slots", () => ({
  getContributions: () => [
    {
      id: "test-copy",
      feature: "message-actions",
      order: 10,
      labelKey: "message-actions.actions.copy",
      icon: Copy,
      isAvailable: () => true,
      run: vi.fn(),
    },
    {
      id: "test-delete",
      feature: "message-actions",
      order: 70,
      labelKey: "message-actions.actions.deleteMe",
      icon: Trash2,
      destructive: true,
      isAvailable: () => false,
      unavailableReasonKey: () => "reasons.pending",
      run: vi.fn(),
    },
    {
      id: "test-unpin",
      feature: "message-actions",
      order: 51,
      labelKey: "message-actions.actions.unpin",
      icon: Copy,
      isAvailable: () => false,
      run: vi.fn(),
    },
  ],
}));

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
    cleanup();
  });

  it("renders translated action labels", () => {
    renderHost();
    fireEvent.click(
      screen.getByRole("button", { name: en.messageActions, expanded: false }),
    );
    expect(screen.getByRole("menuitem", { name: "Copy" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Delete for me" })).toBeTruthy();
  });

  it("shows disabled reason when provided", () => {
    renderHost();
    fireEvent.click(
      screen.getByRole("button", { name: en.messageActions, expanded: false }),
    );
    expect(screen.getByText("Still sending")).toBeTruthy();
  });

  it("hides unavailable actions that give no reason", () => {
    renderHost();
    fireEvent.click(
      screen.getByRole("button", { name: en.messageActions, expanded: false }),
    );
    expect(screen.queryByRole("menuitem", { name: "Unpin" })).toBeNull();
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
