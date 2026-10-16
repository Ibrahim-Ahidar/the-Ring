import { SinglePaneSkeleton, SkeletonBlock, SkeletonListRows } from "@/shell/components/skeleton/Skeleton";

export default function Loading() {
  return (
    <SinglePaneSkeleton>
      <SkeletonBlock style={{ blockSize: 44, inlineSize: "100%" }} />
      <div>
        <SkeletonListRows count={5} />
      </div>
    </SinglePaneSkeleton>
  );
}
