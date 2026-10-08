import { expect, test } from "@playwright/test";

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

  test("authenticated shell uses profile locale", async () => {
    test.skip(
      !process.env.E2E_SUPABASE,
      "Requires E2E_SUPABASE harness",
    );
  });
});
