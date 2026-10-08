import type {
  ContributionKind,
  ContributionKindMap,
  FeatureContributions,
  ResolvedContribution,
} from "./types";

export type FeatureContributionEntry = {
  feature: string;
  contributions: FeatureContributions;
};

/**
 * Builds the full translation key for a feature-scoped labelKey.
 * Convention: namespace is the feature folder name; pass `{feature}.{labelKey}` to `useTranslations()`.
 */
export function featureLabelKey(feature: string, labelKey: string): string {
  return `${feature}.${labelKey}`;
}

function hasOrder(
  item: ContributionKindMap[ContributionKind],
): item is ContributionKindMap[ContributionKind] & { order: number } {
  return "order" in item && typeof (item as { order?: number }).order === "number";
}

export function mergeContributions<K extends ContributionKind>(
  registry: readonly FeatureContributionEntry[],
  kind: K,
): ResolvedContribution<K>[] {
  const merged: ResolvedContribution<K>[] = [];

  for (const { feature, contributions } of registry) {
    const bucket = contributions[kind];
    if (!bucket?.length) {
      continue;
    }

    for (const entry of bucket as ContributionKindMap[K][]) {
      const withFeature = {
        ...entry,
        feature,
      } as ResolvedContribution<K>;

      if ("labelKey" in entry && typeof entry.labelKey === "string") {
        (withFeature as ResolvedContribution<K> & { labelKey: string }).labelKey =
          featureLabelKey(feature, entry.labelKey);
      }

      merged.push(withFeature);
    }
  }

  merged.sort((a, b) => {
    if (kind === "messageRenderer") {
      const typeA = "type" in a ? String(a.type) : "";
      const typeB = "type" in b ? String(b.type) : "";
      return typeA.localeCompare(typeB);
    }

    const orderA = hasOrder(a) ? a.order : 0;
    const orderB = hasOrder(b) ? b.order : 0;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    const idA = "id" in a ? String(a.id) : "";
    const idB = "id" in b ? String(b.id) : "";
    return idA.localeCompare(idB);
  });

  return merged;
}
