import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../..");
const LOCALES = ["ar", "en", "fr"] as const;

function catalogDirs(): string[] {
  const features = path.join(ROOT, "src/features");
  const dirs = [path.resolve(ROOT, "../../packages/i18n/messages")];
  for (const name of readdirSync(features)) {
    const dir = path.join(features, name, "messages");
    if (existsSync(dir)) dirs.push(dir);
  }
  return dirs;
}

function flatten(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    flatten(child, prefix ? `${prefix}/${key}` : key),
  );
}

describe("message catalogs", () => {
  for (const dir of catalogDirs()) {
    const label = path.relative(ROOT, dir).replace(/\\/g, "/");

    it(`${label}: keys never contain "." (next-intl reads dots as nesting)`, () => {
      for (const locale of LOCALES) {
        const keys = flatten(JSON.parse(readFileSync(path.join(dir, `${locale}.json`), "utf8")));
        expect(keys.filter((key) => key.includes("."))).toEqual([]);
      }
    });

    it(`${label}: ar, en, and fr define the same keys`, () => {
      const [ar, en, fr] = LOCALES.map((locale) =>
        flatten(JSON.parse(readFileSync(path.join(dir, `${locale}.json`), "utf8"))).sort(),
      );
      expect(ar).toEqual(en);
      expect(fr).toEqual(en);
    });
  }
});
