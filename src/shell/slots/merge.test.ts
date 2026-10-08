import { describe, expect, it } from "vitest";
import { Search, Settings } from "lucide-react";

import { mergeContributions } from "./merge";
import type { FeatureContributions } from "./types";

describe("mergeContributions", () => {
  it("merges, resolves label keys, and sorts by order", () => {
    const registry = [
      {
        feature: "beta",
        contributions: {
          nav: [
            {
              id: "b",
              labelKey: "nav.beta",
              href: "/b",
              icon: Settings,
              order: 20,
            },
          ],
        } satisfies FeatureContributions,
      },
      {
        feature: "alpha",
        contributions: {
          nav: [
            {
              id: "a",
              labelKey: "nav.alpha",
              href: "/a",
              icon: Search,
              order: 10,
            },
          ],
        } satisfies FeatureContributions,
      },
    ] as const;

    const merged = mergeContributions(registry, "nav");
    expect(merged.map((item) => item.id)).toEqual(["a", "b"]);
    expect(merged[0]?.labelKey).toBe("alpha.nav.alpha");
    expect(merged[1]?.labelKey).toBe("beta.nav.beta");
  });
});
