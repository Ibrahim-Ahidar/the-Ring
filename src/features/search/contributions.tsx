import type { FeatureContributions } from "@/shell/slots/types";

import { ConversationSearchTab } from "@/features/search/components/ConversationSearchTab";

export const contributions: FeatureContributions = {
  rightPanelTab: [
    {
      id: "search-in-conversation",
      order: 20,
      labelKey: "threadTabLabel",
      Component: ConversationSearchTab,
    },
  ],
};
