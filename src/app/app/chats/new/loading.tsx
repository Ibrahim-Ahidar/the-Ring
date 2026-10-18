import { SinglePaneSkeleton, SkeletonButton, SkeletonField } from "@/shell/components/skeleton/Skeleton";
import ui from "@/shell/styles/ui.module.css";

/** New chat: header, then one card with the username field and the open button. */
export default function Loading() {
  return (
    <SinglePaneSkeleton>
      <div className={ui.settingsCard} aria-hidden="true">
        <div className={ui.settingsCardBody}>
          <SkeletonField />
          <SkeletonButton />
        </div>
      </div>
    </SinglePaneSkeleton>
  );
}
