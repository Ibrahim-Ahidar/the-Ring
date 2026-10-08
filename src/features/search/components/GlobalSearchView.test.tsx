// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import ar from "../messages/ar.json";
import { GlobalSearchView } from "./GlobalSearchView";

vi.mock("../context/SearchProvider", () => ({
  useSearch: () => ({
    state: {
      query: "",
      loading: false,
      errorCode: null,
      person: null,
      conversations: [],
      messages: [],
      messagesHasMore: false,
      nextMessageCursor: null,
      loadingMore: false,
    },
    setQuery: vi.fn(),
    submitSearch: vi.fn(),
    loadMoreMessages: vi.fn(),
  }),
}));

describe("GlobalSearchView accessibility", () => {
  it("renders an accessible search field in Arabic", () => {
    render(
      <NextIntlClientProvider locale="ar" messages={{ search: ar }}>
        <div dir="rtl">
          <GlobalSearchView />
        </div>
      </NextIntlClientProvider>,
    );

    expect(screen.getByLabelText(ar.fieldLabel)).toBeTruthy();
  });
});
