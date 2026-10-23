import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const SRC = resolve(__dirname, "../..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe("timing tool is dev-only", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("only hooks.ts imports the runtime, and only dynamically behind the dev condition", () => {
    const importers = walk(SRC).filter((file) => {
      if (/platform[\\/]timing[\\/]runtime\.ts$/.test(file)) return false;
      if (/\.test\.tsx?$/.test(file)) return false;
      return /timing\/runtime|from "\.\/runtime"|import\("\.\/runtime"\)/.test(readFileSync(file, "utf8"));
    });
    expect(importers.map((f) => f.replace(SRC, "").replace(/\\/g, "/"))).toEqual([
      "/platform/timing/hooks.ts",
    ]);

    const hooks = readFileSync(join(SRC, "platform/timing/hooks.ts"), "utf8");
    const imports = hooks.match(/import\("\.\/runtime"\)/g) ?? [];
    const guards =
      hooks.match(/process\.env\.NODE_ENV !== "production" \|\| process\.env\.NEXT_PUBLIC_PULSE_TIMING === "1"/g) ?? [];
    expect(imports.length).toBeGreaterThan(0);
    expect(guards.length).toBe(imports.length);
    expect(hooks).not.toMatch(/^import .* from "\.\/runtime"/m);
  });

  it("does nothing in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_PULSE_TIMING", "");
    const raf = vi.fn();
    vi.stubGlobal("requestAnimationFrame", raf);
    const hooks = await import("./hooks");
    hooks.timingTapStart("a");
    hooks.timingBubbleShown("a");
    hooks.timingArrival(new Date().toISOString());
    hooks.timingChatOpenStart("c");
    hooks.timingChatOpenPainted("c");
    hooks.timingColdStartPainted();
    expect(raf).not.toHaveBeenCalled();
  });

  it("is enabled in production only with NEXT_PUBLIC_PULSE_TIMING=1", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_PULSE_TIMING", "1");
    const raf = vi.fn();
    vi.stubGlobal("requestAnimationFrame", raf);
    const hooks = await import("./hooks");
    hooks.timingBubbleShown("a");
    expect(raf).toHaveBeenCalledTimes(1);
  });
});
