import {
  SinglePaneSkeleton,
  SkeletonActions,
  SkeletonField,
  SkeletonLine,
} from "@/shell/components/skeleton/Skeleton";
import ui from "@/shell/styles/ui.module.css";

/** New group: one card with name, description, members (+ hint), avatar and the create button. */
export default function Loading() {
  return (
    <SinglePaneSkeleton>
      <div className={ui.settingsCard} aria-hidden="true">
        <div className={ui.settingsCardBody}>
          <SkeletonField />
          <SkeletonField tall />
          <SkeletonField hint />
          <div className={ui.field}>
            <SkeletonLine width={96} fontSize="var(--text-sm)" />
            <SkeletonLine width="60%" fontSize="var(--text-md)" />
          </div>
          <SkeletonActions />
        </div>
      </div>
    </SinglePaneSkeleton>
  );
}
