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

test.describe("realtime", () => {
  test.skip(!journeysEnabled, SKIP_REASON);

  test("two sessions exchange messages without reload", async ({ browser }) => {
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
    await sendMessage(a, "ping from alice");

    await openFirstConversation(b);
    await expect(b.getByText("ping from alice")).toBeVisible();

    // From here neither page navigates: delivery must arrive over realtime.
    await sendMessage(b, "pong from bob");
    await expect(a.getByText("pong from bob")).toBeVisible();
    await sendMessage(a, "second from alice");
    await expect(b.getByText("second from alice")).toBeVisible();

    await aliceCtx.close();
    await bobCtx.close();
  });
});
