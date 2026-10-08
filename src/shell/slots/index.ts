import { featureContributions } from "@/shell/generated/features";

import { mergeContributions } from "./merge";
import type { ContributionKind, ResolvedContribution } from "./types";

export type { FeatureContributions } from "./types";
export {
  featureLabelKey,
  mergeContributions,
  type FeatureContributionEntry,
} from "./merge";
export * from "./types";

/**
 * Returns merged contributions for a slot kind from the generated feature registry,
 * sorted by `order` then `id`. Entries with `labelKey` are rewritten to `{feature}.{labelKey}`.
 */
export function getContributions<K extends ContributionKind>(
  kind: K,
): ResolvedContribution<K>[] {
  return mergeContributions(featureContributions, kind);
}
