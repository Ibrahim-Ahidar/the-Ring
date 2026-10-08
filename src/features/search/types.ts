import type { SearchCard } from "@/features/discovery-contacts/types";

export type ConversationSearchHit = {
  id: string;
  type: "direct" | "group";
  title: string | null;
  peerUsername: string | null;
};

export type MessageSearchHit = {
  messageId: string;
  conversationId: string;
  conversationTitle?: string | null;
  snippet: string;
  matchStart: number;
  createdAt: string;
};

export type SearchGlobalPage = {
  person: SearchCard | null;
  conversations: ConversationSearchHit[];
  messages: MessageSearchHit[];
  messagesHasMore: boolean;
  nextMessageCursor: string | null;
};

export type SearchConversationPage = {
  messages: MessageSearchHit[];
  hasMore: boolean;
  nextCursor: string | null;
};
