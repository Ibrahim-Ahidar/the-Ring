import {
  SinglePaneSkeleton,
  SkeletonActions,
  SkeletonField,
  SkeletonHero,
  SkeletonLine,
  SkeletonListRows,
} from "@/shell/components/skeleton/Skeleton";
import ui from "@/shell/styles/ui.module.css";

/** Group admin: hero, edit card (name, description, save) and the member list. */
export default function Loading() {
  return (
    <SinglePaneSkeleton>
      <SkeletonHero lines={["var(--text-lg)"]} actions={1} />
      <div className={ui.settingsCard} aria-hidden="true">
        <div className={ui.settingsCardBody}>
          <SkeletonField />
          <SkeletonField tall />
          <SkeletonActions width={96} />
        </div>
      </div>
      <div className={ui.settingsCard} aria-hidden="true">
        <div className={ui.settingsCardHead}>
          <SkeletonLine width={120} fontSize="var(--text-lg)" />
        </div>
        <SkeletonListRows count={4} />
      </div>
    </SinglePaneSkeleton>
  );
}
