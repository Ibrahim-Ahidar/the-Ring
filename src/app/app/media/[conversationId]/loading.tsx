import { SinglePaneSkeleton, SkeletonBar, SkeletonBlock } from "@/shell/components/skeleton/Skeleton";
import styles from "@/shell/components/skeleton/skeleton.module.css";

/** Shared media: three tab chips (32px pills) over the square tile grid. */
export default function Loading() {
  return (
    <SinglePaneSkeleton>
      <div className={styles.stack} style={{ gap: "var(--space-16)" }}>
        <div className={styles.chips}>
          <SkeletonBar width={72} height={32} className={styles.pill} />
          <SkeletonBar width={64} height={32} className={styles.pill} />
          <SkeletonBar width={64} height={32} className={styles.pill} />
        </div>
        <div className={styles.grid}>
          {Array.from({ length: 18 }, (_, i) => (
            <SkeletonBlock key={i} className={styles.tile} />
          ))}
        </div>
      </div>
    </SinglePaneSkeleton>
  );
}
