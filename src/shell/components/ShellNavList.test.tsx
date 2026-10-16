// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import shellAr from "../messages/ar.json";
import shellEn from "../messages/en.json";
import { AppShell, isConversationRoute } from "./AppShell";
import { activeNavId, ShellNavList } from "./ShellNavList";

const nav = vi.hoisted(() => ({ pathname: "/app/chats" }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/shell/slots", () => ({
  getContributions: () => [],
}));

const LOCALES = {
  en: {
    shell: shellEn,
  },
  ar: {
    shell: shellAr,
  },
} as const;

function renderNav(locale: keyof typeof LOCALES) {
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  return render(
    <NextIntlClientProvider locale={locale} messages={LOCALES[locale]}>
      <ShellNavList />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  nav.pathname = "/app/chats";
});

afterEach(() => {
  cleanup();
});

describe("ShellNavList", () => {
  for (const locale of ["en", "ar"] as const) {
    it(`links every top-level destination from /app/chats (${locale})`, () => {
      renderNav(locale);
      const s = LOCALES[locale];
      const region = screen.getByRole("navigation", { name: s.shell.nav.primary });

      const expected: [string, string][] = [
        [s.shell.nav.chats, "/app/chats"],
        [s.shell.nav.groups, "/app/chats?filter=groups"],
        [s.shell.nav.contacts, "/app/contacts"],
        [s.shell.nav.settings, "/app/settings"],
      ];
      const links = within(region).getAllByRole("link");
      expect(links.map((link) => link.getAttribute("href"))).toEqual(
        expected.map(([, href]) => href),
      );
      for (const [name, href] of expected) {
        const link = within(region).getByRole("link", { name: new RegExp(name) });
        expect(link.getAttribute("href")).toBe(href);
        expect(link.getAttribute("title")).toBe(name);
      }
    });
  }

  it("marks only the active destination with aria-current", () => {
    renderNav("en");
    const current = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(current.map((link) => link.getAttribute("href"))).toEqual(["/app/chats"]);
  });

  it("activeNavId picks the longest matching href", () => {
    const entries = [
      { id: "chats", href: "/app/chats" },
      { id: "new", href: "/app/chats/new" },
      { id: "settings", href: "/app/settings" },
    ];
    expect(activeNavId("/app/chats/abc", entries)).toBe("chats");
    expect(activeNavId("/app/chats/new", entries)).toBe("new");
    expect(activeNavId("/app/settings/privacy", entries)).toBe("settings");
    expect(activeNavId("/app/chatsx", entries)).toBeNull();
  });
});

describe("AppShell navigation", () => {
  function renderShell(pathname: string) {
    nav.pathname = pathname;
    return render(
      <NextIntlClientProvider locale="ar" messages={LOCALES.ar}>
        <AppShell>
          <p>content</p>
        </AppShell>
      </NextIntlClientProvider>,
    );
  }

  it("renders the primary nav alongside the chats screen", () => {
    const { container } = renderShell("/app/chats");
    expect(screen.getByRole("navigation", { name: shellAr.nav.primary })).toBeTruthy();
    expect(container.querySelector(".shell-root")?.getAttribute("data-conversation-open")).toBe(
      "false",
    );
  });

  it("flags open conversations so the mobile tab bar can hide", () => {
    const { container } = renderShell("/app/chats/123");
    expect(container.querySelector(".shell-root")?.getAttribute("data-conversation-open")).toBe(
      "true",
    );
  });

  it("isConversationRoute only matches conversation screens", () => {
    expect(isConversationRoute("/app/chats")).toBe(false);
    expect(isConversationRoute("/app/chats/new")).toBe(false);
    expect(isConversationRoute("/app/chats/new")).toBe(false);
    expect(isConversationRoute("/app/groups/new")).toBe(false);
    expect(isConversationRoute("/app/settings/privacy")).toBe(false);
    expect(isConversationRoute("/app/chats/abc")).toBe(true);
    expect(isConversationRoute("/app/groups/g1")).toBe(true);
    expect(isConversationRoute("/app/media/abc")).toBe(true);
  });
});
