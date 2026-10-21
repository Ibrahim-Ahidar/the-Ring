import { describe, expect, it } from "vitest";

import type { PaletteCommand } from "@/features/locale-appearance/collect-commands";
import { filterCommands } from "@/features/locale-appearance/filter-commands";

const SAMPLE: PaletteCommand[] = [
  {
    id: "go-chats",
    labelKey: "locale-appearance.cmdChats",
    href: "/app/chats",
    order: 10,
    feature: "locale-appearance",
  },
  {
    id: "go-search",
    labelKey: "locale-appearance.cmdSearch",
    href: "/app/search",
    order: 20,
    feature: "locale-appearance",
  },
];

describe("filterCommands", () => {
  it("returns all commands when query is empty", () => {
    expect(filterCommands(SAMPLE, "", () => "")).toHaveLength(2);
  });

  it("filters by resolved label", () => {
    const filtered = filterCommands(SAMPLE, "search", (cmd) =>
      cmd.id === "go-search" ? "Go to search" : "Go to chats",
    );
    expect(filtered.map((c) => c.id)).toEqual(["go-search"]);
  });
});
