import { defineConfig, devices } from "@playwright/test";

// No webServer: scripts/perf-nav.mjs starts `next start` itself with PULSE_PERF_TRACE=1.
const baseURL = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3100";

export default defineConfig({
  testDir: ".",
  testMatch: /nav-timing\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  // Bounded waits so a hang fails in a minute with a clear message, not after the 10 min test timeout.
  expect: { timeout: 30_000 },
  use: { baseURL, actionTimeout: 30_000, navigationTimeout: 60_000, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
