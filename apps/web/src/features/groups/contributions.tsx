import type { FeatureContributions } from "@/shell/slots/types";

import { MembersPanelTab } from "./components/MembersPanelTab";
import { SystemMessageRenderer } from "./components/SystemMessageRenderer";

export const contributions: FeatureContributions = {
  messageRenderer: [
    {
      type: "system",
      Component: SystemMessageRenderer,
    },
  ],
  rightPanelTab: [
    {
      id: "groups-members",
      order: 10,
      labelKey: "membersTab",
      Component: MembersPanelTab,
    },
  ],
};
