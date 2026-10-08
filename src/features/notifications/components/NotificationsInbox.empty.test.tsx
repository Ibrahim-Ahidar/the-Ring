// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import ar from "../messages/ar.json";
import { NotificationsInbox } from "./NotificationsInbox";

vi.mock("../context/NotificationsContext", () => ({
  useNotifications: () => ({
    state: {
      items: [],
      unreadCount: 0,
      nextCursor: null,
      loading: false,
      loadingMore: false,
      errorCode: null,
    },
    reload: vi.fn(),
    loadMore: vi.fn(),
    markOneRead: vi.fn(),
    markAllRead: vi.fn(),
  }),
}));

describe("NotificationsInbox empty state", () => {
  it("renders an accessible heading in Arabic", () => {
    render(
      <NextIntlClientProvider locale="ar" messages={{ notifications: ar }}>
        <div dir="rtl">
          <NotificationsInbox />
        </div>
      </NextIntlClientProvider>,
    );

    expect(
      screen.getByRole("heading", { name: ar.emptyTitle }),
    ).toBeTruthy();
  });
});
