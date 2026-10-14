// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { Bell, MailQuestion } from "lucide-react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import notificationsAr from "@/features/notifications/messages/ar.json";
import notificationsEn from "@/features/notifications/messages/en.json";
import requestsAr from "@/features/message-requests/messages/ar.json";
import requestsEn from "@/features/message-requests/messages/en.json";
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
  getContributions: (kind: string) => {
    if (kind !== "nav") return [];
    return [
      {
        id: "message-requests",
        labelKey: "message-requests.navLabel",
        href: "/app/chats/requests",
        icon: MailQuestion,
        order: 35,
        badge: () => <span data-testid="requests-badge">2</span>,
      },
      {
        id: "notifications",
        labelKey: "notifications.navLabel",
        href: "/app/notifications",
        icon: Bell,
        order: 50,
        badge: () => <span data-testid="notifications-badge">5</span>,
      },
    ];
  },
}));

const LOCALES = {
  en: {
    shell: shellEn,
    notifications: notificationsEn,
    "message-requests": requestsEn,
  },
  ar: {
    shell: shellAr,
    notifications: notificationsAr,
    "message-requests": requestsAr,
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
        [s.shell.nav.groups, "/app/groups"],
        [s.shell.nav.search, "/app/search"],
        [s["message-requests"].navLabel, "/app/chats/requests"],
        [s.shell.nav.contacts, "/app/contacts"],
        [s.notifications.navLabel, "/app/notifications"],
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

    it(`shows notification and request badges from Chats (${locale})`, () => {
      renderNav(locale);
      expect(screen.getByTestId("notifications-badge")).toBeTruthy();
      expect(screen.getByTestId("requests-badge")).toBeTruthy();
    });
  }

  it("marks only the active destination with aria-current", () => {
    renderNav("en");
    const current = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(current.map((link) => link.getAttribute("href"))).toEqual(["/app/chats"]);
  });

  it("prefers the most specific destination for nested routes", () => {
    nav.pathname = "/app/chats/requests";
    renderNav("en");
    const current = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(current.map((link) => link.getAttribute("href"))).toEqual(["/app/chats/requests"]);
  });

  it("activeNavId picks the longest matching href", () => {
    const entries = [
      { id: "chats", href: "/app/chats" },
      { id: "requests", href: "/app/chats/requests" },
      { id: "settings", href: "/app/settings" },
    ];
    expect(activeNavId("/app/chats/abc", entries)).toBe("chats");
    expect(activeNavId("/app/chats/requests", entries)).toBe("requests");
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
    expect(isConversationRoute("/app/chats/requests")).toBe(false);
    expect(isConversationRoute("/app/groups/new")).toBe(false);
    expect(isConversationRoute("/app/settings/privacy")).toBe(false);
    expect(isConversationRoute("/app/chats/abc")).toBe(true);
    expect(isConversationRoute("/app/groups/g1")).toBe(true);
    expect(isConversationRoute("/app/media/abc")).toBe(true);
  });
});
