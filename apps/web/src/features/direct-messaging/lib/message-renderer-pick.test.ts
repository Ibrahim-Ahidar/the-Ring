import { describe, expect, it } from "vitest";

import type { ResolvedContribution } from "@/shell/slots/types";

import { pickMessageRenderer } from "./message-renderer-pick";

function renderer(
  feature: string,
  type: "text" | "system",
  order?: number,
): ResolvedContribution<"messageRenderer"> {
  return {
    feature,
    type,
    order,
    Component: () => null,
  };
}

describe("pickMessageRenderer", () => {
  it("chooses the lowest order for the same type", () => {
    const picked = pickMessageRenderer(
      [
        renderer("direct-messaging", "text", 10),
        renderer("message-actions", "text", 0),
      ],
      "text",
    );
    expect(picked?.feature).toBe("message-actions");
  });

  it("returns the system renderer for system messages", () => {
    const picked = pickMessageRenderer(
      [renderer("groups", "system", 0), renderer("message-actions", "text", 0)],
      "system",
    );
    expect(picked?.feature).toBe("groups");
  });
});
