import { SinglePaneSkeleton, SkeletonHero, SkeletonRowsCard } from "@/shell/components/skeleton/Skeleton";

/** Profile: hero (avatar, name, handle, presence, actions), shared groups and block/report cards. */
export default function Loading() {
  return (
    <SinglePaneSkeleton>
      <SkeletonHero lines={["var(--text-lg)", "var(--text-sm)"]} actions={2} />
      <SkeletonRowsCard rows={2} />
      <SkeletonRowsCard rows={2} title={false} />
    </SinglePaneSkeleton>
  );
}
