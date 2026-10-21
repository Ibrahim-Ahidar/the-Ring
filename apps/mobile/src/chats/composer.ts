export type ComposerInput = { online: boolean; draft: string; pending: boolean };

/** Whether the send button is enabled: needs text, no send in flight, and a connection. */
export function canSend({ online, draft, pending }: ComposerInput): boolean {
  return online && !pending && draft.trim().length > 0;
}
