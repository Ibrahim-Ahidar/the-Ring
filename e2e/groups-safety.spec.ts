import { expect, test, type Page } from "@playwright/test";

import { adminClient } from "../tests/harness/supabase";
import { journeysEnabled, SKIP_REASON } from "./support/env";
import { newMemberContext, seedMember, signIn } from "./support/journeys";

async function searchUsername(page: Page, username: string): Promise<void> {
  await page.goto("/app/contacts");
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByRole("button", { name: "Search" }).click();
}

test.describe("groups and safety", () => {
  test.skip(!journeysEnabled, SKIP_REASON);

  test("group create, invite and promote show in the members list", async ({ browser }) => {
    const owner = await seedMember("gown");
    const guest = await seedMember("ggst");
    const context = await newMemberContext(browser);
    const page = await context.newPage();
    await signIn(page, owner);

    await page.goto("/app/groups/new");
    await page.getByLabel("Group name").fill("Journey crew");
    await page.getByRole("button", { name: "Create group" }).click();
    await page.waitForURL(/\/app\/chats\/[0-9a-f-]+/);
    const groupId = new URL(page.url()).pathname.split("/").pop();

    await page.goto(`/app/groups/${groupId}`);
    await page.getByLabel("Invite by username").fill(guest.username);
    await page.getByRole("button", { name: "Send invite" }).click();

    const members = page.getByRole("region", { name: "Members" });
    const guestRow = members.getByRole("listitem").filter({ hasText: `@${guest.username}` });
    await expect(guestRow).toBeVisible();
    await expect(guestRow.getByText("Member", { exact: true })).toBeVisible();

    await guestRow.getByRole("button", { name: "Make admin" }).click();
    await expect(guestRow.getByText("Admin", { exact: true })).toBeVisible();
    await context.close();
  });

  test("a block hides the person from search and refuses a direct chat", async ({ browser }) => {
    const blocker = await seedMember("blkr");
    const target = await seedMember("blkd");
    const context = await newMemberContext(browser);
    const page = await context.newPage();
    await signIn(page, blocker);

    await searchUsername(page, target.username);
    await expect(
      page.getByRole("list", { name: "Search result" }).getByRole("link", { name: new RegExp(`@${target.username}`) }),
    ).toBeVisible();

    await page.goto(`/app/profile/${target.username}`);
    await page.getByRole("button", { name: "Block member" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Block", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    await searchUsername(page, target.username);
    await expect(page.getByText("No one matched that username.")).toBeVisible();

    await page.goto(`/app/chats/new?username=${target.username}`);
    await expect(page.getByText("You cannot message this person.")).toBeVisible();
    await context.close();
  });

  test("a report shows a received state", async ({ browser }) => {
    const reporter = await seedMember("rptr");
    const subject = await seedMember("rpts");
    const context = await newMemberContext(browser);
    const page = await context.newPage();
    await signIn(page, reporter);

    await page.goto(`/app/profile/${subject.username}`);
    await page.getByRole("button", { name: "Report", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Choose the closest reason for this report.").selectOption({ label: "Spam" });
    await dialog.getByRole("button", { name: "Send report" }).click();
    await expect(dialog).toBeHidden();

    await page.goto("/app/settings/privacy");
    const reports = page.getByRole("region", { name: "Your reports" });
    await expect(reports.getByText("Received")).toBeVisible();
    await context.close();
  });

  test("a message request stays out of the chat list until accepted", async ({ browser }) => {
    const sender = await seedMember("rqs");
    const recipient = await seedMember("rqr");
    await adminClient()
      .from("profiles")
      .update({ who_can_message: "requests" })
      .eq("id", recipient.id);

    const senderContext = await newMemberContext(browser);
    const senderPage = await senderContext.newPage();
    await signIn(senderPage, sender);
    await senderPage.goto("/app/chats/new");
    await senderPage.getByLabel("Username", { exact: true }).fill(recipient.username);
    await senderPage.getByRole("button", { name: "Open chat" }).click();
    await senderPage.getByLabel("Note (optional)").fill("Hello from the journey");
    await senderPage.getByRole("button", { name: "Send request" }).click();
    await expect(senderPage.getByRole("status")).toContainText("Request sent");
    await senderContext.close();

    const context = await newMemberContext(browser);
    const page = await context.newPage();
    await signIn(page, recipient);
    await page.goto("/app/chats");
    await expect(
      page.getByRole("list", { name: "Conversation list" }).getByRole("link", { name: new RegExp(sender.username) }),
    ).toHaveCount(0);

    await page.goto("/app/chats/requests");
    const incoming = page.getByRole("list", { name: "Requests for you" });
    const row = incoming.getByRole("listitem").filter({ hasText: `@${sender.username}` });
    await expect(row).toContainText("Hello from the journey");
    await row.getByRole("button", { name: /^Accept/ }).click();
    await page.waitForURL(/\/app\/chats\/[0-9a-f-]+/);
    await context.close();
  });
});
