import { describe, expect, it } from "vitest";

import ar from "@/shell/messages/ar.json";
import en from "@/shell/messages/en.json";
import fr from "@/shell/messages/fr.json";

describe("public page catalogs", () => {
  it.each([
    ["ar", ar],
    ["en", en],
    ["fr", fr],
  ])("%s has real legal content and landing features", (_locale, catalog) => {
    for (const kind of ["terms", "privacy"] as const) {
      expect(catalog.legal[kind].sections.length).toBeGreaterThanOrEqual(6);
      expect(catalog.legal[kind].intro.length).toBeGreaterThan(20);
    }
    expect(catalog.landing.features).toHaveLength(3);
    expect(catalog.landing.title).toBe("the Ring");
    expect(JSON.stringify(catalog.legal)).not.toMatch(/placeholder|مؤقت|provisoire/i);
  });

  it("keeps section counts aligned across locales", () => {
    for (const kind of ["terms", "privacy"] as const) {
      expect(ar.legal[kind].sections).toHaveLength(en.legal[kind].sections.length);
      expect(fr.legal[kind].sections).toHaveLength(en.legal[kind].sections.length);
    }
  });
});
