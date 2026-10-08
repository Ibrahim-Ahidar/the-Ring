import type { MessageRendererType } from "@/shell/slots/types";
import type { ResolvedContribution } from "@/shell/slots/types";

export function pickMessageRenderer(
  renderers: ResolvedContribution<"messageRenderer">[],
  type: MessageRendererType,
): ResolvedContribution<"messageRenderer"> | undefined {
  const matches = renderers.filter((entry) => entry.type === type);
  if (matches.length === 0) {
    return undefined;
  }
  return [...matches].sort((a, b) => {
    const orderA = "order" in a && typeof a.order === "number" ? a.order : 0;
    const orderB = "order" in b && typeof b.order === "number" ? b.order : 0;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.feature.localeCompare(b.feature);
  })[0];
}
