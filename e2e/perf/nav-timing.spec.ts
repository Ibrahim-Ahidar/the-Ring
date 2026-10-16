import { writeFileSync } from "node:fs";

import { expect, test, type Page } from "@playwright/test";

import { journeysEnabled, SKIP_REASON } from "../support/env";
import { newMemberContext, seedMember } from "../support/journeys";

// Driven by scripts/perf-nav.mjs (`npm run perf:nav`) against `next build && next start`.
// Not part of the regular e2e run: it needs PERF_NAV=1.
const RUNS = Number(process.env.PERF_RUNS ?? 5);
const OUT = process.env.PERF_WINDOWS_OUT ?? ".scratch/perf-nav/windows.json";

// Self-contained helpers (the workflow copies tooling over older refs, whose shared
// journey helpers use goto's default waitUntil "load"). "load" never fires in CI
// while a subresource or realtime request stays pending, and the page.goto then
// hangs until the test timeout. Wait for DOM content plus an explicit locator instead.
async function gotoReady(page: Page, path: string, ready: () => Promise<void>) {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await ready();
}

async function loginAs(page: Page, username: string) {
  await gotoReady(page, "/login", () =>
    expect(page.getByLabel("Email")).toBeVisible(),
  );
  await page.getByLabel("Email").fill(`${username}@pulse.test`);
  await page.getByLabel("Password", { exact: true }).fill("PulseTest123!");
  await page.getByRole("button", { name: "Log in" }).click();
  // Older refs land on /app, newer ones on /app/chats; the "load" event may never fire.
  await page.waitForURL(/\/app(\/|$)/, { waitUntil: "commit" });
}

async function startChat(page: Page, username: string) {
  await gotoReady(page, "/app/contacts", () =>
    expect(page.getByLabel("Username", { exact: true })).toBeVisible(),
  );
  // Retry fill+submit: before hydration the input value is wiped and the submit is a no-op.
  const result = page
    .getByRole("list", { name: "Search result" })
    .getByRole("link", { name: new RegExp(`@${username}`) });
  await expect(async () => {
    await page.getByLabel("Username", { exact: true }).fill(username);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(result).toBeVisible({ timeout: 8_000 });
  }).toPass({ timeout: 60_000 });
  await result.click();
  await page.getByRole("link", { name: "Start conversation" }).click();
  await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible();
}

type Sample = { journey: string; run: number; ms: number; start: number; end: number };

test.describe("nav timing", () => {
  test.skip(!process.env.PERF_NAV, "Run through `npm run perf:nav` (sets PERF_NAV=1)");
  test.skip(!journeysEnabled, SKIP_REASON);
  test.setTimeout(10 * 60_000);

  test("journeys", async ({ browser }) => {
    const [me, peerA, peerB] = await Promise.all([
      seedMember("perf"),
      seedMember("pera"),
      seedMember("perb"),
    ]);

    // Seed two conversations with a last message each.
    for (const peer of [peerA, peerB]) {
      const ctx = await newMemberContext(browser);
      const page = await ctx.newPage();
      await loginAs(page, me.username);
      await startChat(page, peer.username);
      await page.getByRole("textbox", { name: "Message" }).fill(`hello ${peer.username}`);
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByText(`hello ${peer.username}`)).toBeVisible();
      await ctx.close();
    }

    const samples: Sample[] = [];
    const timed = async (journey: string, run: number, fn: () => Promise<void>) => {
      const start = Date.now();
      const t0 = performance.now();
      await fn();
      const ms = performance.now() - t0;
      samples.push({ journey, run, ms: Math.round(ms), start, end: Date.now() });
    };

    for (let run = 0; run < RUNS; run++) {
      // Fresh context per run: cold client cache, like a new visit.
      const ctx = await newMemberContext(browser);
      const page = await ctx.newPage();
      const list = page.getByRole("list", { name: "Conversation list" });
      const timeline = page.getByRole("log");
      const lastMessage = (peer: { username: string }) =>
        timeline.getByText(`hello ${peer.username}`);

      await timed("login_to_chats_ready", run, async () => {
        await loginAs(page, me.username);
        await expect(list.getByRole("link").first()).toBeVisible();
      });

      await timed("open_chat", run, async () => {
        await list.getByRole("link").filter({ hasText: peerA.username }).click();
        await expect(lastMessage(peerA)).toBeVisible();
      });

      await timed("switch_chat_a_to_b", run, async () => {
        await list.getByRole("link").filter({ hasText: peerB.username }).click();
        await expect(lastMessage(peerB)).toBeVisible();
      });

      const nav = page.getByRole("navigation", { name: "Main navigation" });
      await timed("chats_to_groups", run, async () => {
        await nav.getByRole("link", { name: "Groups" }).click();
        await page.waitForURL(/\/app\/groups/);
        await expect(page.getByRole("heading").first()).toBeVisible();
      });

      await timed("open_settings", run, async () => {
        await nav.getByRole("link", { name: "Settings" }).click();
        await page.waitForURL(/\/app\/settings/);
        await expect(page.getByRole("heading").first()).toBeVisible();
      });

      await ctx.close();
    }

    writeFileSync(OUT, JSON.stringify({ runs: RUNS, samples }, null, 2));
  });
});
