import { SmilePlus } from "lucide-react";

import type { FeatureContributions } from "@/shell/slots/types";

import { ReactionBubbleExtra } from "@/features/reactions/components/ReactionBubbleExtra";
import { ReactionPickerOverlay } from "@/features/reactions/components/ReactionPickerOverlay";
import { requestReactionPicker } from "@/features/reactions/reactions-events";

function canReact(ctx: {
  message: { id: string; deletion_scope: string };
}): boolean {
  if (ctx.message.id.startsWith("pending-")) {
    return false;
  }
  return ctx.message.deletion_scope !== "everyone";
}

export const contributions: FeatureContributions = {
  overlay: [
    {
      id: "reactions-picker",
      Component: ReactionPickerOverlay,
    },
  ],
  bubbleExtra: [
    {
      id: "reactions-counts",
      order: 20,
      Component: ReactionBubbleExtra,
    },
  ],
  messageAction: [
    {
      id: "reactions-add",
      order: 10,
      labelKey: "reactAction",
      icon: SmilePlus,
      isAvailable: (ctx) => canReact(ctx),
      run: (ctx) => {
        requestReactionPicker({
          messageId: ctx.message.id,
          conversationId: ctx.conversationId,
          currentUserId: ctx.currentUserId,
        });
      },
    },
  ],
};
