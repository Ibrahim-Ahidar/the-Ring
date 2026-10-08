"use server";

import { getSessionContext } from "@/platform/session";

import { searchConversation, searchGlobal } from "./service";
import type { SearchConversationPage, SearchGlobalPage } from "./types";

async function requireSession() {
  return getSessionContext();
}

export async function searchGlobalAction(input: {
  query: string;
  cursor?: string | null;
}): Promise<
  | { ok: true; value: SearchGlobalPage }
  | { ok: false; error: { code: string } }
> {
  const session = await requireSession();
  if (!session) {
    return { ok: false, error: { code: "platform.unauthenticated" } };
  }
  return searchGlobal(session.rpc, input);
}

export async function searchConversationAction(input: {
  conversationId: string;
  query: string;
  cursor?: string | null;
}): Promise<
  | { ok: true; value: SearchConversationPage }
  | { ok: false; error: { code: string } }
> {
  const session = await requireSession();
  if (!session) {
    return { ok: false, error: { code: "platform.unauthenticated" } };
  }
  return searchConversation(session.rpc, input);
}
