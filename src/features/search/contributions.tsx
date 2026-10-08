import type { FeatureContributions } from "@/shell/slots/types";

import { ConversationSearchTab } from "@/features/search/components/ConversationSearchTab";
import { MessageJumpListener } from "@/features/search/components/MessageJumpListener";

export const contributions: FeatureContributions = {
  overlay: [
    {
      id: "search-message-jump",
      Component: MessageJumpListener,
    },
  ],
  rightPanelTab: [
    {
      id: "search-in-conversation",
      order: 20,
      labelKey: "threadTabLabel",
      Component: ConversationSearchTab,
    },
  ],
};
