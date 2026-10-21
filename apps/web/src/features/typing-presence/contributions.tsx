import type { FeatureContributions } from "@/shell/slots/types";

import { GlobalPresence } from "@/features/typing-presence/components/GlobalPresence";
import { ConversationHeaderStatus } from "@/features/typing-presence/components/ConversationHeaderStatus";

export const contributions: FeatureContributions = {
  overlay: [{ id: "typing-presence-global", Component: GlobalPresence }],
  headerStatus: [
    {
      id: "typing-presence-status",
      order: 10,
      Component: ConversationHeaderStatus,
    },
  ],
};
