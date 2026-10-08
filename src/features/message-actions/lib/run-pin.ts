import { pinMessageAction, unpinMessageAction } from "../actions";
import { emitMessageMutation } from "../message-actions-events";

export async function runPinToggle(input: {
  messageId: string;
  conversationId: string;
  pinned: boolean;
}): Promise<boolean> {
  const result = input.pinned
    ? await unpinMessageAction({ messageId: input.messageId })
    : await pinMessageAction({ messageId: input.messageId });
  if (!result.ok) {
    return false;
  }
  emitMessageMutation({
    kind: "upsert",
    conversationId: input.conversationId,
    message: result.value,
  });
  return true;
}
