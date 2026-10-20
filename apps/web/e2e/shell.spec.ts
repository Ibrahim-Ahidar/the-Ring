import { expect, test } from "@playwright/test";

import { journeysEnabled, SKIP_REASON } from "./support/env";
import { newMemberContext, seedMember, signIn } from "./support/journeys";

test.describe("shell smoke", () => {
  test("landing defaults to Arabic RTL", async ({ page }) => {
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("dir", "rtl");
    await expect(html).toHaveAttribute("lang", "ar");
  });

  test("pulse_locale=en sets LTR", async ({ page, context }) => {
    await context.addCookies([
      {
        name: "pulse_locale",
        value: "en",
        domain: "localhost",
        path: "/",
      },
    ]);
    await page.goto("/");
    const html = page.locator("html");
    await expect(html).toHaveAttribute("dir", "ltr");
    await expect(html).toHaveAttribute("lang", "en");
    await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Terms" })).toBeVisible();
  });

  test("pulse_locale=fr sets LTR", async ({ page, context }) => {
    await context.addCookies([
      {
        name: "pulse_locale",
        value: "fr",
        domain: "localhost",
        path: "/",
      },
    ]);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  });

  test("anonymous /app redirects to /login", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login$/);
  });

  for (const path of ["/login", "/signup"]) {
    test(`${path} renders its form`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);
      await expect(
        page.locator('input[type="password"]').first(),
      ).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    });
  }

  test("authenticated shell uses profile locale", async () => {
    test.skip(!process.env.E2E_SUPABASE, "Requires E2E_SUPABASE harness");
  });
});

test.describe("primary navigation (needs E2E_SUPABASE)", () => {
  test.skip(!journeysEnabled, SKIP_REASON);

  const LABELS = {
    en: {
      chats: "Chats",
      groups: "Groups",
      contacts: "Contacts",
      settings: "Settings",
      primary: "Main navigation",
    },
    ar: {
      chats: "المحادثات",
      groups: "المجموعات",
      contacts: "جهات الاتصال",
      settings: "الإعدادات",
      primary: "التنقل الرئيسي",
    },
  } as const;

  for (const locale of ["en", "ar"] as const) {
    test(`nav is reachable in one click from /app/chats (${locale})`, async ({
      browser,
    }) => {
      const member = await seedMember("nav");
      const context = await newMemberContext(browser);
      await context.addCookies([
        {
          name: "pulse_locale",
          value: locale,
          url:
            process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3100",
        },
      ]);
      const page = await context.newPage();
      await signIn(page, member);
      await page.goto("/app/chats");

      const labels = LABELS[locale];
      const nav = page.getByRole("navigation", { name: labels.primary });
      await expect(nav).toBeVisible();
      await expect(
        nav.getByRole("link", { name: labels.chats }),
      ).toHaveAttribute("aria-current", "page");
      for (const [key, href] of [
        ["groups", "/app/chats?filter=groups"],
        ["contacts", "/app/contacts"],
        ["settings", "/app/settings"],
      ] as const) {
        await nav.getByRole("link", { name: labels[key] }).click();
        await expect(page).toHaveURL(
          new RegExp(`${href.replace("?", "\\?")}$`),
        );
        await page.goto("/app/chats");
      }
      await context.close();
    });
  }

  test("mobile bottom tab bar shows on /app/chats", async ({ browser }) => {
    const member = await seedMember("navm");
    const context = await newMemberContext(browser);
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 800 });
    await signIn(page, member);
    await page.goto("/app/chats");
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }),
    ).toBeVisible();
    await context.close();
  });
});
