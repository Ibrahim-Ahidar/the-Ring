import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC_ROOT = join(process.cwd(), "src");

function walkTsFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walkTsFiles(fullPath, files);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("server-only env boundary", () => {
  it("throws when server env module is imported outside react-server", async () => {
    await expect(import("@/platform/env/server")).rejects.toThrow(
      /server-only|Server-only|cannot be imported/i,
    );
  });

  it("does not reference SUPABASE_SERVICE_ROLE_KEY outside server env and admin client", () => {
    const allowed = new Set([
      relative(process.cwd(), join(SRC_ROOT, "platform/env/server.ts")),
      relative(process.cwd(), join(SRC_ROOT, "platform/env/validate.ts")),
      relative(process.cwd(), join(SRC_ROOT, "instrumentation.ts")),
    ].map((p) => p.replace(/\\/g, "/")));

    const violations: string[] = [];

    for (const file of walkTsFiles(SRC_ROOT)) {
      const rel = relative(process.cwd(), file).replace(/\\/g, "/");
      const content = readFileSync(file, "utf8");
      if (!content.includes("SUPABASE_SERVICE_ROLE_KEY")) {
        continue;
      }
      if (!allowed.has(rel)) {
        violations.push(rel);
      }
    }

    expect(violations).toEqual([]);
  });

  it('does not import server env or admin client from "use client" modules', () => {
    const violations: string[] = [];

    for (const file of walkTsFiles(SRC_ROOT)) {
      const content = readFileSync(file, "utf8");
      if (!content.includes('"use client"')) {
        continue;
      }
      if (
        content.includes("@/platform/env/server") ||
        content.includes("@/platform/supabase/admin")
      ) {
        violations.push(relative(process.cwd(), file).replace(/\\/g, "/"));
      }
    }

    expect(violations).toEqual([]);
  });
});
