import { expect, test } from "@playwright/test";

import { journeysEnabled, SKIP_REASON } from "./support/env";
import {
  newMemberContext,
  openChatWith,
  openFirstConversation,
  seedMember,
  sendMessage,
  signIn,
} from "./support/journeys";

test.describe("typing", () => {
  test.skip(!journeysEnabled, SKIP_REASON);

  test("typing shows in the other session and clears", async ({ browser }) => {
    const [alice, bob] = await Promise.all([
      seedMember("tyal"),
      seedMember("tybo"),
    ]);
    const aliceCtx = await newMemberContext(browser);
    const bobCtx = await newMemberContext(browser);
    const a = await aliceCtx.newPage();
    const b = await bobCtx.newPage();

    await signIn(a, alice);
    await signIn(b, bob);
    await openChatWith(a, bob.username);
    await sendMessage(a, "opening the thread");
    await openFirstConversation(b);
    await expect(b.getByText("opening the thread")).toBeVisible();

    const typingLabel = a.getByRole("status").filter({ hasText: /is typing/ });
    const composer = b.getByRole("textbox", { name: "Message" });
    await composer.pressSequentially("typing now", { delay: 60 });
    await expect(typingLabel).toBeVisible();

    // Clearing the draft (or idling) removes the indicator.
    await composer.fill("");
    await expect(typingLabel).toBeHidden({ timeout: 15_000 });

    await aliceCtx.close();
    await bobCtx.close();
  });
});
