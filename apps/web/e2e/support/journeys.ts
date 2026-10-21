import {
  expect,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import { createUser, type HarnessUser } from "../../tests/harness/supabase";
import { TEST_PASSWORD, uniqueName } from "./env";
import { latestEmailCode } from "./mail";

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3100";

// New browser context with the English locale cookie so accessible names are stable.
export async function newMemberContext(
  browser: Browser,
): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: BASE_URL });
  await context.addCookies([
    { name: "pulse_locale", value: "en", url: BASE_URL },
  ]);
  return context;
}

// Creates a confirmed member outside the browser (service role), as the spec allows.
export function seedMember(prefix: string): Promise<HarnessUser> {
  return createUser({ username: uniqueName(prefix), password: TEST_PASSWORD });
}

export async function signIn(
  page: Page,
  member: { username: string },
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(`${member.username}@pulse.test`);
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/app/);
}

// Signs up through the UI, confirming the emailed 6-digit code. Returns the new username.
export async function signUpThroughUi(
  page: Page,
  prefix: string,
): Promise<string> {
  const username = uniqueName(prefix);
  const email = `${username}@pulse.test`;
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Username").fill(username);
  await expect(page.getByText(`@${username} is available`)).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
  await page.getByLabel("Confirm password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign up" }).click();

  await expect(
    page.getByRole("heading", { name: "Confirm your email" }),
  ).toBeVisible();
  await page.getByLabel("6-digit code").fill(await latestEmailCode(email));
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page).toHaveURL(/\/app/);
  return username;
}

// Searches an exact username from /app/contacts and opens a chat with the result.
export async function openChatWith(page: Page, username: string): Promise<void> {
  await page.goto("/app/contacts");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByRole("button", { name: "Search" }).click();
  await page
    .getByRole("list", { name: "Search result" })
    .getByRole("link", { name: new RegExp(`@${username}`) })
    .click();
  await page.getByRole("link", { name: "Start conversation" }).click();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
}

// Opens the first conversation in the list (the one the other member just started).
export async function openFirstConversation(page: Page): Promise<void> {
  await page.goto("/app/chats");
  await page
    .getByRole("list", { name: "Conversation list" })
    .getByRole("link")
    .first()
    .click();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
}

export async function sendMessage(page: Page, text: string): Promise<void> {
  await page.getByRole("textbox", { name: "Message" }).fill(text);
  await page.getByRole("button", { name: "Send" }).click();
}
