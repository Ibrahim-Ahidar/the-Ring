export type ReactionPickerRequest = {
  messageId: string;
  conversationId: string;
  currentUserId: string;
};

type Listener = (request: ReactionPickerRequest) => void;

const listeners = new Set<Listener>();

export function requestReactionPicker(request: ReactionPickerRequest): void {
  listeners.forEach((listener) => listener(request));
}

export function onReactionPickerRequest(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
