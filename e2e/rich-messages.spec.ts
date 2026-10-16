import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { journeysEnabled, SKIP_REASON } from "./support/env";
import {
  newMemberContext,
  openChatWith,
  openFirstConversation,
  seedMember,
  sendMessage,
  signIn,
} from "./support/journeys";

const IMAGE_FIXTURE = path.join(__dirname, "fixtures", "pixel.png");

function bubble(page: Page, text: string) {
  return page.getByRole("article").filter({ hasText: text });
}

async function chooseAction(page: Page, text: string, action: string) {
  await bubble(page, text)
    .first()
    .getByRole("button", { name: "Message actions" })
    .click();
  await page.getByRole("menuitem", { name: action }).click();
}

test.describe("rich messages", () => {
  test.skip(!journeysEnabled, SKIP_REASON);

  test("reply, reaction, edit and delete-for-everyone show in both sessions", async ({
    browser,
  }) => {
    const [alice, bob] = await Promise.all([
      seedMember("alice"),
      seedMember("bob"),
    ]);
    const aliceCtx = await newMemberContext(browser);
    const bobCtx = await newMemberContext(browser);
    const a = await aliceCtx.newPage();
    const b = await bobCtx.newPage();

    await signIn(a, alice);
    await signIn(b, bob);
    await openChatWith(a, bob.username);
    await sendMessage(a, "original from alice");
    await openFirstConversation(b);
    await expect(bubble(b, "original from alice")).toBeVisible();

    // Reply: bob replies; alice sees the reply arrive over realtime.
    await chooseAction(b, "original from alice", "Reply");
    await expect(b.getByText("Replying to")).toBeVisible();
    await sendMessage(b, "reply from bob");
    await expect(bubble(a, "reply from bob")).toBeVisible();

    // Reaction: bob reacts; alice sees the chip.
    await chooseAction(b, "original from alice", "Add reaction");
    await b.getByRole("button", { name: "Thumbs up" }).click();
    await b.getByRole("button", { name: "Close" }).click();
    await expect(
      bubble(a, "original from alice").getByRole("button", {
        name: /Thumbs up, 1 reaction/,
      }),
    ).toBeVisible();

    // Edit: alice edits her own message; bob sees the new text and the label.
    await chooseAction(a, "original from alice", "Edit");
    const editBox = a.getByLabel("Updated message text");
    await editBox.fill("edited by alice");
    await a.getByRole("button", { name: "Save changes" }).click();
    await expect(bubble(a, "edited by alice")).toBeVisible();
    await expect(bubble(b, "edited by alice")).toBeVisible();
    await expect(bubble(b, "edited by alice").getByText("Edited")).toBeVisible();

    // Delete for everyone: alice deletes; bob sees the tombstone, not the text.
    await chooseAction(a, "edited by alice", "Delete for everyone");
    await a
      .getByRole("dialog")
      .getByRole("button", { name: "Delete for everyone" })
      .click();
    await expect(a.getByText("Message deleted")).toBeVisible();
    await expect(b.getByText("Message deleted")).toBeVisible();
    await expect(b.getByText("edited by alice")).toHaveCount(0);

    await aliceCtx.close();
    await bobCtx.close();
  });

  test("image upload completes in the thread and appears in shared media", async ({
    browser,
  }) => {
    const [alice, bob] = await Promise.all([
      seedMember("alice"),
      seedMember("bob"),
    ]);
    const ctx = await newMemberContext(browser);
    const page = await ctx.newPage();

    await signIn(page, alice);
    await openChatWith(page, bob.username);
    await sendMessage(page, "photo incoming");

    await page.locator('input[type="file"]').setInputFiles(IMAGE_FIXTURE);
    await expect(
      page.getByRole("img", { name: /pixel\.png|Shared image/ }).first(),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("progressbar")).toHaveCount(0);

    const conversationId = page.url().split("/chats/")[1]?.split(/[?#]/)[0];
    await page.goto(`/app/media/${conversationId}`);
    await expect(page.getByText("Shared media").first()).toBeVisible();
    await expect(page.getByText("No images shared yet")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /pixel\.png|Open image/ }).first()).toBeVisible();

    await ctx.close();
  });
});
