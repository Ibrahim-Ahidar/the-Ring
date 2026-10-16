import { SinglePaneSkeleton, SkeletonBar, SkeletonBlock } from "@/shell/components/skeleton/Skeleton";
import styles from "@/shell/components/skeleton/skeleton.module.css";

export default function Loading() {
  return (
    <SinglePaneSkeleton>
      <div className={styles.row}>
        <SkeletonBar width={72} height={32} className={styles.pill} />
        <SkeletonBar width={72} height={32} className={styles.pill} />
        <SkeletonBar width={72} height={32} className={styles.pill} />
      </div>
      <div className={styles.grid}>
        {Array.from({ length: 12 }, (_, i) => (
          <SkeletonBlock key={i} className={styles.tile} />
        ))}
      </div>
    </SinglePaneSkeleton>
  );
}
