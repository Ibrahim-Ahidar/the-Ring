import { writeFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { journeysEnabled, SKIP_REASON } from "../support/env";
import {
  newMemberContext,
  openChatWith,
  seedMember,
  sendMessage,
  signIn,
} from "../support/journeys";

// Driven by scripts/perf-nav.mjs (`npm run perf:nav`) against `next build && next start`.
// Not part of the regular e2e run: it needs PERF_NAV=1.
const RUNS = Number(process.env.PERF_RUNS ?? 5);
const OUT = process.env.PERF_WINDOWS_OUT ?? ".scratch/perf-nav/windows.json";

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
      await signIn(page, me);
      await openChatWith(page, peer.username);
      await sendMessage(page, `hello ${peer.username}`);
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
        await page.goto("/login");
        await page.getByLabel("Email").fill(`${me.username}@pulse.test`);
        await page.getByLabel("Password", { exact: true }).fill("PulseTest123!");
        await page.getByRole("button", { name: "Log in" }).click();
        await page.waitForURL(/\/app\/chats/);
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
