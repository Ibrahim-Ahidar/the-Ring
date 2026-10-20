#!/usr/bin/env node
// Repeatable navigation baseline: production build + server, Playwright journeys, server trace summary.
// Usage: npm run perf:nav [-- --label before|after] [--skip-build] [--runs 5]
// Needs a local Supabase stack (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY). See .scratch/perf-nav/README.md.
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const label = opt("label", "before");
const runs = Number(opt("runs", "5"));
const skipBuild = args.includes("--skip-build");
const port = Number(process.env.PERF_PORT ?? 3100);
const dir = ".scratch/perf-nav";
mkdirSync(dir, { recursive: true });
const shell = process.platform === "win32";

const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"];
const missing = required.filter((k) => !process.env[k]?.trim());
if (missing.length) {
  console.error(
    `perf:nav needs a local Supabase stack. Missing env: ${missing.join(", ")}.\n` +
      "Run `npx supabase start` and export the keys from `npx supabase status -o env`.",
  );
  process.exit(2);
}
const env = {
  ...process.env,
  E2E_SUPABASE: "1",
  PERF_NAV: "1",
  PERF_RUNS: String(runs),
  PERF_WINDOWS_OUT: join(dir, `windows-${label}.json`),
  NEXT_PUBLIC_APP_URL: `http://localhost:${port}`,
};

if (!skipBuild) {
  const build = spawnSync("npm", ["run", "build"], { env, shell, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const out = (build.stdout ?? "") + (build.stderr ?? "");
  writeFileSync(join(dir, `build-${label}.txt`), out);
  if (build.status !== 0) {
    console.error("next build failed; see", join(dir, `build-${label}.txt`));
    process.exit(build.status ?? 1);
  }
}

const serverLog = join(dir, `server-${label}.log`);
const logStream = createWriteStream(serverLog);
const server = spawn("npx", ["next", "start", "-p", String(port)], {
  env: { ...env, PULSE_PERF_TRACE: "1" },
  shell,
  detached: !shell,
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.pipe(logStream);
server.stderr.pipe(logStream);
const stopServer = () => {
  if (shell) spawnSync("taskkill", ["/pid", String(server.pid), "/t", "/f"]);
  else {
    // shell:true wraps npx in `sh`; signal the whole process group so next itself stops.
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      server.kill("SIGTERM");
    }
  }
};

async function waitUp() {
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw new Error(`next start exited early (${server.exitCode}); see ${serverLog}`);
    try {
      const r = await fetch(`http://localhost:${port}/login`);
      if (r.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("next start did not come up");
}

let code = 1;
try {
  await waitUp();
  const pw = spawnSync("npx", ["playwright", "test", "-c", "e2e/perf/playwright.perf.config.ts"], {
    env,
    shell,
    stdio: "inherit",
  });
  code = pw.status ?? 1;
} finally {
  stopServer();
  logStream.end();
}
if (code !== 0) process.exit(code);

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const { samples } = JSON.parse(readFileSync(env.PERF_WINDOWS_OUT, "utf8"));
const journeys = [...new Set(samples.map((s) => s.journey))];
const result = { label, runs, generatedAt: new Date().toISOString(), medianMs: {}, samplesMs: {} };
for (const j of journeys) {
  const ms = samples.filter((s) => s.journey === j).map((s) => s.ms);
  result.samplesMs[j] = ms;
  result.medianMs[j] = median(ms);
}
writeFileSync(join(dir, `nav-${label}.json`), JSON.stringify(result, null, 2));

// Server trace: attribute [perf] lines (epoch-ms start `t=`) to the journey window they started in.
const parsed = readFileSync(serverLog, "utf8")
  .split(/\r?\n/)
  .map((l) => /^\[perf\] t=(\d+) dur=(\d+)ms (.*)$/.exec(l))
  .filter(Boolean)
  .map((m) => ({ t: Number(m[1]), dur: Number(m[2]), what: m[3] }));
const report = [`Server trace (${label}): outgoing fetches (Supabase Auth/RPC) and middleware per journey`];
for (const j of journeys) {
  const wins = samples.filter((s) => s.journey === j);
  const perRun = wins.map((w) => {
    const hit = parsed.filter((p) => p.t >= w.start - 5 && p.t <= w.end);
    const fetches = hit.filter((p) => p.what.startsWith("fetch"));
    return { fetches: fetches.length, fetchMs: fetches.reduce((a, p) => a + p.dur, 0), hit };
  });
  report.push(
    `\n## ${j}`,
    `round trips/run (median): ${median(perRun.map((r) => r.fetches))}; summed fetch ms/run (median): ${median(perRun.map((r) => r.fetchMs))}`,
  );
  const counts = new Map();
  for (const p of perRun.flatMap((r) => r.hit)) {
    const k = p.what.replace(/status=\d+/, "").trim();
    const c = counts.get(k) ?? { n: 0, ms: 0 };
    c.n++;
    c.ms += p.dur;
    counts.set(k, c);
  }
  for (const [k, c] of [...counts].sort((a, b) => b[1].n - a[1].n)) {
    report.push(`  ${(c.n / wins.length).toFixed(1)}x/run avg ${Math.round(c.ms / c.n)}ms  ${k}`);
  }
}
writeFileSync(join(dir, `trace-${label}.txt`), report.join("\n") + "\n");
console.log(JSON.stringify(result.medianMs, null, 2));
console.log(`wrote ${dir}/{build,nav,trace}-${label}.*`);
