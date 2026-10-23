// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

import en from "../messages/en.json";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/app/chats" }));
vi.mock("../actions", () => ({
  archiveConversationAction: vi.fn(),
  clearChatAction: vi.fn(),
  deleteChatAction: vi.fn(),
  moveToFolderAction: vi.fn(),
  muteConversationAction: vi.fn(),
  pinConversationAction: vi.fn(),
  removeFromFolderAction: vi.fn(),
  setConversationUnreadAction: vi.fn(),
  unarchiveConversationAction: vi.fn(),
  unmuteConversationAction: vi.fn(),
  unpinConversationAction: vi.fn(),
}));
vi.mock("@/features/direct-messaging/actions", () => ({ markReadAction: vi.fn() }));
vi.mock("@/features/discovery-contacts/actions", () => ({
  favoriteAction: vi.fn(),
  unfavoriteAction: vi.fn(),
  listFavoritesAction: vi.fn(async () => ({ ok: true, value: [] })),
}));
vi.mock("@/features/groups/actions", () => ({ leaveGroupAction: vi.fn() }));
vi.mock("@/features/safety/actions", () => ({
  blockUserAction: vi.fn(),
  unblockUserAction: vi.fn(),
  fetchBlocksAction: vi.fn(async () => ({ ok: true, value: [] })),
}));

import { ConversationMenuSheet } from "./ConversationMenuSheet";

afterEach(cleanup);

const base = {
  conversationId: "c1",
  membership: { pinned_at: null, muted_until: null, archived_at: null },
  point: { x: 200, y: 120 },
};

function renderMenu(type: "direct" | "group") {
  render(
    <NextIntlClientProvider
      locale="en"
      messages={{ "conversation-organization": en } as never}
    >
      <ConversationMenuSheet
        ctx={{ ...base, conversationType: type, otherUserId: "u2", otherUsername: "bob" }}
        folders={[]}
        onClose={() => {}}
      />
    </NextIntlClientProvider>,
  );
  return screen
    .getAllByRole("button")
    .map((b) => b.textContent?.trim())
    .filter(Boolean);
}

describe("ConversationMenuSheet", () => {
  it("opens at the point with no title and no Close button", () => {
    renderMenu("direct");
    const dialog = screen.getByRole("dialog");
    expect(parseFloat(dialog.style.left)).toBeGreaterThan(150);
    expect(parseFloat(dialog.style.top)).toBeGreaterThan(100);
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByRole("button", { name: /^close$/i })).toBeNull();
  });

  it("DM lists the full set in order, with Block and Delete but no Exit group", () => {
    expect(renderMenu("direct")).toEqual([
      "Archive chat",
      "Mute notifications",
      "Pin chat",
      "Mark as unread",
      "Add to favourites",
      "Add to list",
      "Block",
      "Clear chat",
      "Delete chat",
    ]);
  });

  it("group lists Exit group but not Block or Delete", () => {
    expect(renderMenu("group")).toEqual([
      "Archive chat",
      "Mute notifications",
      "Pin chat",
      "Mark as unread",
      "Add to favourites",
      "Add to list",
      "Clear chat",
      "Exit group",
    ]);
  });
});
