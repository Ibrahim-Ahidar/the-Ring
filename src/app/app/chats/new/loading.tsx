import { SinglePaneSkeleton, SkeletonBlock, SkeletonListRows } from "@/shell/components/skeleton/Skeleton";
import styles from "@/shell/components/skeleton/skeleton.module.css";

export default function Loading() {
  return (
    <SinglePaneSkeleton>
      <SkeletonBlock className={styles.field} />
      <div>
        <SkeletonListRows count={4} />
      </div>
    </SinglePaneSkeleton>
  );
}
