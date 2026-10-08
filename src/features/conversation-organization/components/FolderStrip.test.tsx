// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import ar from "../messages/ar.json";
import { FolderStrip } from "./FolderStrip";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/app/chats",
  useSearchParams: () => new URLSearchParams(),
}));

describe("FolderStrip", () => {
  it("shows accessible folder control in Arabic when there are no folders", () => {
    render(
      <NextIntlClientProvider locale="ar" messages={{ "conversation-organization": ar }}>
        <FolderStrip folders={[]} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("toolbar", { name: "مجلدات المحادثات" })).toBeTruthy();
    expect(screen.getByText("أنشئ مجلداً لتجميع المحادثات.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "إنشاء مجلد" })).toBeTruthy();
  });
});
