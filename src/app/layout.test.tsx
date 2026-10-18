import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const resolveAccent = vi.fn();

vi.mock("next-intl", () => ({
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("next-intl/server", () => ({
  getMessages: async () => ({}),
  getTranslations: async () => (key: string) => key,
}));
vi.mock("@/shell/components/StaleBuildReload", () => ({ StaleBuildReload: () => null }));
vi.mock("@/shell/components/TimeZoneSync", () => ({
  TimeZoneSync: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/shell/preferences", () => ({
  resolveLocale: async () => "en",
  resolveTheme: async () => "system",
  resolveTimeZone: async () => "UTC",
  resolveAccent: () => resolveAccent(),
}));
vi.mock("./globals.css", () => ({}));

import RootLayout, { generateViewport } from "./layout";

describe("RootLayout accent", () => {
  it("renders data-accent from the resolved accent", async () => {
    resolveAccent.mockResolvedValue("green");
    const html = renderToStaticMarkup(await RootLayout({ children: null }));
    expect(html).toContain('data-accent="green"');
  });

  it("renders the indigo fallback and an indigo theme color", async () => {
    resolveAccent.mockResolvedValue("indigo");
    const html = renderToStaticMarkup(await RootLayout({ children: null }));
    expect(html).toContain('data-accent="indigo"');
    expect((await generateViewport()).themeColor).toBe("#4f46e5");
  });

  it("derives the theme color from the green accent", async () => {
    resolveAccent.mockResolvedValue("green");
    expect((await generateViewport()).themeColor).toBe("#1daa61");
  });
});
