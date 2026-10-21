import { expect, test } from "@playwright/test";

import { journeysEnabled, SKIP_REASON } from "./support/env";
import {
  newMemberContext,
  openChatWith,
  seedMember,
  signIn,
} from "./support/journeys";

test.describe("locale, mobile, keyboard and offline", () => {
  test.skip(!journeysEnabled, SKIP_REASON);

  test("switching en, fr and ar translates the shell and only ar is rtl", async ({
    browser,
  }) => {
    const member = await seedMember("loc");
    const ctx = await newMemberContext(browser);
    const page = await ctx.newPage();
    await signIn(page, member);
    await page.goto("/app/settings/language");

    const html = page.locator("html");
    await expect(html).toHaveAttribute("lang", "en");
    await expect(html).toHaveAttribute("dir", "ltr");
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }),
    ).toBeVisible();

    await page.getByText("Français", { exact: true }).click();
    await expect(html).toHaveAttribute("lang", "fr");
    await expect(html).toHaveAttribute("dir", "ltr");
    await expect(
      page.getByRole("navigation", { name: "Navigation principale" }),
    ).toBeVisible();

    await page.getByText("العربية", { exact: true }).click();
    await expect(html).toHaveAttribute("lang", "ar");
    await expect(html).toHaveAttribute("dir", "rtl");
    await expect(
      page.getByRole("navigation", { name: "التنقل الرئيسي" }),
    ).toBeVisible();

    await ctx.close();
  });

  test("mobile viewport navigates list, thread, back and settings", async ({
    browser,
  }) => {
    const [alice, bob] = await Promise.all([
      seedMember("mob_a"),
      seedMember("mob_b"),
    ]);
    const mobileCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      baseURL:
        process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3100",
    });
    await mobileCtx.addCookies([
      {
        name: "pulse_locale",
        value: "en",
        url: process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3100",
      },
    ]);
    const page = await mobileCtx.newPage();
    await signIn(page, alice);
    await openChatWith(page, bob.username);

    await page.getByRole("link", { name: "Back to chats" }).click();
    await expect(page).toHaveURL(/\/app\/chats$/);
    await expect(
      page.getByRole("list", { name: "Conversation list" }),
    ).toBeVisible();

    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Settings" })
      .click();
    await expect(page).toHaveURL(/\/app\/settings/);

    await mobileCtx.close();
  });

  test("a message is sent with the keyboard only", async ({ browser }) => {
    const [alice, bob] = await Promise.all([
      seedMember("kb_a"),
      seedMember("kb_b"),
    ]);
    const ctx = await newMemberContext(browser);
    const page = await ctx.newPage();
    await signIn(page, alice);
    await openChatWith(page, bob.username);

    // Reload the thread so no earlier click leaves focus on the composer.
    await page.reload();
    const composer = page.getByRole("textbox", { name: "Message" });
    await expect(composer).toBeVisible();
    for (let i = 0; i < 60; i += 1) {
      if (await composer.evaluate((el) => el === document.activeElement)) {
        break;
      }
      await page.keyboard.press("Tab");
    }
    await expect(composer).toBeFocused();

    await page.keyboard.type("typed without a mouse");
    await page.keyboard.press("Enter");
    await expect(page.getByText("typed without a mouse")).toHaveCount(1);
    await expect(composer).toHaveValue("");

    await ctx.close();
  });

  test("an offline send stays unsent and one retry yields one message", async ({
    browser,
  }) => {
    const [alice, bob] = await Promise.all([
      seedMember("off_a"),
      seedMember("off_b"),
    ]);
    const ctx = await newMemberContext(browser);
    const page = await ctx.newPage();
    await signIn(page, alice);
    await openChatWith(page, bob.username);

    await ctx.setOffline(true);
    await page
      .getByRole("textbox", { name: "Message" })
      .fill("sent while offline");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
    await expect(page.getByText("sent while offline")).toHaveCount(1);

    await ctx.setOffline(false);
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
    await expect(page.getByText("sent while offline")).toHaveCount(1);

    // A reload shows the stored state: still exactly one message.
    await page.reload();
    await expect(page.getByText("sent while offline")).toHaveCount(1);

    await ctx.close();
  });
});
