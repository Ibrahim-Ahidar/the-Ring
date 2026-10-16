import { SinglePaneSkeleton, SkeletonBar, SkeletonBlock, SkeletonCircle } from "@/shell/components/skeleton/Skeleton";
import styles from "@/shell/components/skeleton/skeleton.module.css";

export default function Loading() {
  return (
    <SinglePaneSkeleton>
      <div className={`${styles.stack} ${styles.center}`}>
        <SkeletonCircle size={96} />
        <SkeletonBar width={160} height={24} />
        <SkeletonBar width={100} height={14} />
        <SkeletonBar width="60%" height={14} />
      </div>
      <div className={styles.row}>
        <SkeletonBlock className={styles.field} />
        <SkeletonBlock className={styles.field} />
      </div>
    </SinglePaneSkeleton>
  );
}
