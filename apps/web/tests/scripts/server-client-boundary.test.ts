import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(import.meta.dirname, "../../src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === "generated" ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [full] : [];
  });
}

const files = sourceFiles(SRC);
const source = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));
const isClient = (file: string) => /^\s*["']use client["']/.test(source.get(file) ?? "");

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/")
    ? path.join(SRC, spec.slice(2))
    : spec.startsWith(".")
      ? path.resolve(path.dirname(from), spec)
      : null;
  if (!base) {
    return null;
  }
  const candidates = [`${base}.tsx`, `${base}.ts`, path.join(base, "index.tsx"), path.join(base, "index.ts")];
  return candidates.find((candidate) => source.has(candidate)) ?? null;
}

/** `memo(...)` client components that a server file renders directly. */
function memoAtServerBoundary(): string[] {
  const offenders: string[] = [];
  for (const file of files) {
    if (!file.endsWith(".tsx") || isClient(file)) {
      continue;
    }
    const text = source.get(file)!;
    for (const [, names, spec] of text.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g)) {
      const target = resolveImport(file, spec!);
      if (!target || !isClient(target)) {
        continue;
      }
      for (const raw of names!.split(",")) {
        const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop();
        if (!name || !new RegExp(`<${name}[\\s/>]`).test(text)) {
          continue;
        }
        if (new RegExp(`export const ${name}\\s*=\\s*memo\\(`).test(source.get(target)!)) {
          offenders.push(`${path.relative(SRC, target)} (${name}) rendered by ${path.relative(SRC, file)}`);
        }
      }
    }
  }
  return offenders;
}

describe("server → client boundary", () => {
  it("never renders a memo() client component from a server component", () => {
    // A memo() export rendered by a Server Component remounts on every server
    // re-render (router.refresh(), or a server action that writes cookies), which
    // wipes its state and its whole subtree: form input, feedback, drafts, scroll.
    // memo gains nothing there anyway, since server props are new on every render.
    expect(memoAtServerBoundary()).toEqual([]);
  });
});
