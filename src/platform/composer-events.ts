/**
 * Client-side signal from the message composer (owned by direct messaging)
 * to features that react to it, such as typing indicators, without either
 * importing the other.
 */
export type ComposerActivity =
  | { kind: "input"; conversationId: string; isEmpty: boolean }
  | { kind: "sent"; conversationId: string }
  | { kind: "closed"; conversationId: string };

type Listener = (activity: ComposerActivity) => void;

const listeners = new Set<Listener>();

export function emitComposerActivity(activity: ComposerActivity): void {
  listeners.forEach((listener) => listener(activity));
}

export function onComposerActivity(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
