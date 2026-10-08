import type { FeatureContributions } from "@/shell/slots/types";

import { ConversationHeaderStatus } from "@/features/typing-presence/components/ConversationHeaderStatus";

export const contributions: FeatureContributions = {
  headerStatus: [
    {
      id: "typing-presence-status",
      order: 10,
      Component: ConversationHeaderStatus,
    },
  ],
};
