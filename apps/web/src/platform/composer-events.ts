/**
 * Client-side signal from the message composer (owned by direct messaging)
 * to features that react to it, such as typing indicators, without either
 * importing the other.
 */
export type ComposerActivity =
  | { kind: "input"; conversationId: string; isEmpty: boolean }
  | { kind: "sent"; conversationId: string }
  /** Voice recording started (active) or ended, sent or cancelled (not active). */
  | { kind: "recording"; conversationId: string; active: boolean }
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

/** DOM id of the slot above the composer bar where tools may portal a banner (reply preview). */
export function composerAboveId(conversationId: string): string {
  return `composer-above-${conversationId}`;
}

export type ComposerSendExtras = {
  replyToId?: string | null;
};

type ComposerSendExtrasProvider = (
  conversationId: string,
) => ComposerSendExtras | undefined;

let sendExtrasProvider: ComposerSendExtrasProvider | null = null;

/** Lets features (e.g. message-actions) supply send fields without hooking form submit. */
export function setComposerSendExtrasProvider(
  provider: ComposerSendExtrasProvider | null,
): void {
  sendExtrasProvider = provider;
}

export function getComposerSendExtras(
  conversationId: string,
): ComposerSendExtras | undefined {
  return sendExtrasProvider?.(conversationId);
}
