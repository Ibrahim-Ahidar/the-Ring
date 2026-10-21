import { SettingsSectionSkeleton, SkeletonCard } from "@/shell/components/skeleton/Skeleton";

/** Covers the settings index and every settings subpage: title row plus cards. */
export default function Loading() {
  return (
    <SettingsSectionSkeleton>
      <SkeletonCard fields={2} />
      <SkeletonCard fields={3} />
    </SettingsSectionSkeleton>
  );
}
