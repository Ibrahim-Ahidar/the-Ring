// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "../messages/en.json";

const store = vi.hoisted(() => ({ summary: { count: 0, unread: 0 }, search: "" }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(store.search),
}));
vi.mock("../context/MessagingProvider", () => ({
  useMessaging: () => ({ state: { archivedSummary: store.summary } }),
}));

import { ArchivedRow } from "./ArchivedRow";

function renderRow() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ "direct-messaging": en }}>
      <ArchivedRow />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  store.summary = { count: 0, unread: 0 };
  store.search = "";
});
afterEach(cleanup);

describe("ArchivedRow", () => {
  it("is hidden when there are no archived chats", () => {
    const { container } = renderRow();
    expect(container.textContent).toBe("");
  });

  it("shows the count and links to the archived view, without a badge at 0 unread", () => {
    store.summary = { count: 3, unread: 0 };
    renderRow();
    const link = screen.getByRole("link", { name: "Archived · 3" });
    expect(link.getAttribute("href")).toBe("/app/chats?archived=1");
    expect(screen.queryByLabelText(/unread/)).toBeNull();
  });

  it("shows the unread total as a badge", () => {
    store.summary = { count: 2, unread: 5 };
    renderRow();
    expect(screen.getByLabelText("5 unread messages in archived chats").textContent).toBe("5");
  });

  it("is not shown in a filtered list or in the archived view itself", () => {
    store.summary = { count: 2, unread: 1 };
    for (const search of ["filter=unread", "folder=f1", "archived=1"]) {
      store.search = search;
      const { container } = renderRow();
      expect(container.textContent).toBe("");
      cleanup();
    }
  });
});
