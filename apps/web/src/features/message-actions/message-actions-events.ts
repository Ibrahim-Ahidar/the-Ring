import type { TimelineMessage } from "@/platform/timeline";

export type ReplyTarget = {
  conversationId: string;
  messageId: string;
  preview: string;
};

export type EditDialogRequest = {
  message: TimelineMessage;
  conversationId: string;
};

export type DeleteDialogRequest = {
  message: TimelineMessage;
  conversationId: string;
  scope: "me" | "everyone";
};

export type ForwardDialogRequest = {
  message: TimelineMessage;
  sourceConversationId: string;
};

export type JumpToReplyRequest = {
  conversationId: string;
  replyToId: string;
};

type DialogListener = (
  request:
    | EditDialogRequest
    | DeleteDialogRequest
    | ForwardDialogRequest
    | JumpToReplyRequest
    | { kind: "toast"; messageKey: string },
) => void;

const dialogListeners = new Set<DialogListener>();

export function onMessageActionDialog(listener: DialogListener): () => void {
  dialogListeners.add(listener);
  return () => dialogListeners.delete(listener);
}

function emit(
  request: Parameters<DialogListener>[0],
): void {
  dialogListeners.forEach((listener) => listener(request));
}

export function requestEditDialog(request: EditDialogRequest): void {
  emit(request);
}

export function requestDeleteDialog(request: DeleteDialogRequest): void {
  emit(request);
}

export function requestForwardDialog(request: ForwardDialogRequest): void {
  emit(request);
}

export function requestJumpToReply(request: JumpToReplyRequest): void {
  emit(request);
}

export function requestActionToast(messageKey: string): void {
  emit({ kind: "toast", messageKey });
}

export type MessageMutation =
  | { kind: "upsert"; conversationId: string; message: TimelineMessage }
  | { kind: "hide"; conversationId: string; messageId: string };

type MutationListener = (mutation: MessageMutation) => void;

const mutationListeners = new Set<MutationListener>();

export function onMessageMutation(listener: MutationListener): () => void {
  mutationListeners.add(listener);
  return () => mutationListeners.delete(listener);
}

export function emitMessageMutation(mutation: MessageMutation): void {
  mutationListeners.forEach((listener) => listener(mutation));
}

const replyTargets = new Map<string, ReplyTarget>();

export function setReplyTarget(target: ReplyTarget): void {
  replyTargets.set(target.conversationId, target);
}

export function clearReplyTarget(conversationId: string): void {
  replyTargets.delete(conversationId);
}

export function getReplyTarget(conversationId: string): ReplyTarget | null {
  return replyTargets.get(conversationId) ?? null;
}
