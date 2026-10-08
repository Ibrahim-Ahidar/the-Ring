export function conversationChannel(conversationId: string): string {
  return `conversation:${conversationId}`;
}

export function inboxChannel(userId: string): string {
  return `inbox:${userId}`;
}
