import {
  SinglePaneSkeleton,
  SkeletonBlock,
  SkeletonListRows,
  SkeletonSectionLabel,
} from "@/shell/components/skeleton/Skeleton";
import styles from "@/shell/components/skeleton/skeleton.module.css";

/** Contacts: username search, favourites list, recent searches. */
export default function Loading() {
  return (
    <SinglePaneSkeleton>
      <div className={styles.stack} style={{ gap: "var(--space-16)" }}>
        <section>
          <SkeletonSectionLabel width={64} />
          <SkeletonBlock className={styles.search} />
        </section>
        <section>
          <SkeletonSectionLabel width={80} />
          <SkeletonListRows count={3} />
        </section>
        <section>
          <SkeletonSectionLabel width={112} />
          <SkeletonListRows count={3} />
        </section>
      </div>
    </SinglePaneSkeleton>
  );
}
