import type { ReactNode } from "react";

import ui from "@/shell/styles/ui.module.css";
import { PaneHeader } from "./PaneHeader";
import { PaneLayout } from "./PaneLayout";

type Props = {
  title: string;
  /** Back target; defaults to the chat list. */
  backHref?: string;
  actions?: ReactNode;
  /** `false` renders children edge to edge instead of the centred column. */
  centred?: boolean;
  children: ReactNode;
};

/** Full-width page with a header (back arrow, title, actions) and a centred column. */
export function SinglePane({ title, backHref, actions, centred = true, children }: Props) {
  return (
    <PaneLayout view="main">
      <PaneHeader title={title} backHref={backHref} actions={actions} />
      {centred ? (
        <div className={ui.settingsPage}>
          <div className={ui.settingsInner}>{children}</div>
        </div>
      ) : (
        <div className="pane-body scroll">{children}</div>
      )}
    </PaneLayout>
  );
}
