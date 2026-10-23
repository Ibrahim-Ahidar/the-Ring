// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import en from "../messages/en.json";

vi.mock("../actions", () => ({
  archiveConversationAction: vi.fn(),
  moveToFolderAction: vi.fn(),
  muteConversationAction: vi.fn(),
  pinConversationAction: vi.fn(),
  removeFromFolderAction: vi.fn(),
  unarchiveConversationAction: vi.fn(),
  unmuteConversationAction: vi.fn(),
  unpinConversationAction: vi.fn(),
}));

import { ConversationMenuSheet } from "./ConversationMenuSheet";

afterEach(cleanup);

const ctx = {
  conversationId: "c1",
  conversationType: "direct" as const,
  membership: { pinned_at: null, muted_until: null, archived_at: null },
  point: { x: 200, y: 120 },
};

describe("ConversationMenuSheet", () => {
  it("opens at the point with the options, no title and no Close button", () => {
    render(
      <NextIntlClientProvider
        locale="en"
        messages={{ "conversation-organization": en } as never}
      >
        <ConversationMenuSheet ctx={ctx} folders={[]} onClose={() => {}} />
      </NextIntlClientProvider>,
    );
    const dialog = screen.getByRole("dialog");
    expect(parseFloat(dialog.style.left)).toBeGreaterThan(150);
    expect(parseFloat(dialog.style.top)).toBeGreaterThan(100);
    expect(screen.getByRole("button", { name: /pin/i })).toBeTruthy();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByRole("button", { name: /^close$/i })).toBeNull();
  });
});
