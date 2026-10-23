import { isE2eeEnabled } from "@pulse/core/e2ee-flag";

import { getLocalStore } from "@/platform/local-store";

import { listConversationsAction, listMessagesAction } from "../actions";
import {
  createLocalFirstSource,
  type ListConversationsArgs,
  type LocalFirstSource,
  type RemoteSource,
} from "./local-first-source";

const remote: RemoteSource = {
  listConversations: (args) => listConversationsAction(args),
  listMessages: (input) => listMessagesAction(input),
};

let sourcePromise: Promise<LocalFirstSource | null> | null = null;

/** The local-first source, or null when the e2ee flag is off or the local DB is unavailable. */
export function getLocalFirstSource(): Promise<LocalFirstSource | null> {
  if (!isE2eeEnabled()) {
    return Promise.resolve(null);
  }
  sourcePromise ??= getLocalStore()
    .then((store) => (store ? createLocalFirstSource(store, remote) : null))
    .catch(() => null);
  return sourcePromise;
}

/** Call after the local DB is deleted (logout) so the next sign-in builds a fresh source. */
export function resetLocalFirstSource(): void {
  sourcePromise = null;
}

/** Chat list read. Flag on: from the local DB. Flag off: straight to the server. */
export async function readConversations(args: ListConversationsArgs) {
  const source = await getLocalFirstSource();
  return source ? source.listConversations(args) : remote.listConversations(args);
}

/** Chat view read. Flag on: from the local DB (fetching a cold chat once). */
export async function readMessages(input: { conversationId: string; cursor?: string | null }) {
  const source = await getLocalFirstSource();
  return source ? source.listMessages(input) : remote.listMessages(input);
}

/** Explicit refresh: the network fills the local DB, then the read comes from it. */
export async function refreshMessages(conversationId: string) {
  const source = await getLocalFirstSource();
  if (!source) {
    return remote.listMessages({ conversationId });
  }
  await source.syncMessages(conversationId);
  return source.listMessages({ conversationId });
}

export async function refreshConversations(args: ListConversationsArgs) {
  const source = await getLocalFirstSource();
  if (!source) {
    return remote.listConversations(args);
  }
  if (Object.values(args).every((v) => !v)) {
    await source.syncConversations();
  }
  return source.listConversations(args);
}

/** Stores a realtime row in the local DB. No-op with the flag off. */
export async function storeRealtimeMessage(row: Record<string, unknown>): Promise<void> {
  const source = await getLocalFirstSource();
  await source?.applyRealtimeMessage(row);
}
