import { SinglePaneSkeleton, SkeletonBar, SkeletonBlock, SkeletonCircle } from "@/shell/components/skeleton/Skeleton";

export default function Loading() {
  return (
    <SinglePaneSkeleton>
      <SkeletonCircle size={72} />
      <SkeletonBlock style={{ blockSize: 44, inlineSize: "100%" }} />
      <SkeletonBlock style={{ blockSize: 88, inlineSize: "100%" }} />
      <SkeletonBar width="30%" height={16} />
      <SkeletonBlock style={{ blockSize: 44, inlineSize: "100%" }} />
    </SinglePaneSkeleton>
  );
}
