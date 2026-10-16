import { SinglePaneSkeleton, SkeletonCard, SkeletonListRows } from "@/shell/components/skeleton/Skeleton";

export default function Loading() {
  return (
    <SinglePaneSkeleton>
      <SkeletonCard fields={2} />
      <div>
        <SkeletonListRows count={4} />
      </div>
    </SinglePaneSkeleton>
  );
}
