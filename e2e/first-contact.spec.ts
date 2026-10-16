import { expect, test } from "@playwright/test";

import { journeysEnabled, SKIP_REASON } from "./support/env";
import {
  newMemberContext,
  openChatWith,
  seedMember,
  sendMessage,
  signUpThroughUi,
} from "./support/journeys";

test.describe("first contact", () => {
  test.skip(!journeysEnabled, SKIP_REASON);

  test("new member signs up, picks a username, finds a member and sends", async ({
    browser,
  }) => {
    const seeded = await seedMember("seed");
    const context = await newMemberContext(browser);
    const page = await context.newPage();

    await signUpThroughUi(page, "newbie");
    await openChatWith(page, seeded.username);
    await sendMessage(page, "Hello from a new member");

    await expect(page.getByText("Hello from a new member")).toBeVisible();
    await context.close();
  });
});
