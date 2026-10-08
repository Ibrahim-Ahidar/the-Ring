import type { SearchCard } from "@/features/discovery-contacts/types";

import type {
  ConversationSearchHit,
  MessageSearchHit,
} from "../types";

export type SearchUiState = {
  query: string;
  loading: boolean;
  errorCode: string | null;
  person: SearchCard | null;
  conversations: ConversationSearchHit[];
  messages: MessageSearchHit[];
  messagesHasMore: boolean;
  nextMessageCursor: string | null;
  loadingMore: boolean;
};

export const initialSearchState: SearchUiState = {
  query: "",
  loading: false,
  errorCode: null,
  person: null,
  conversations: [],
  messages: [],
  messagesHasMore: false,
  nextMessageCursor: null,
  loadingMore: false,
};

export type SearchAction =
  | { type: "set_query"; query: string }
  | { type: "search_start" }
  | { type: "search_success"; payload: Omit<SearchUiState, "query" | "loading" | "loadingMore" | "errorCode"> }
  | { type: "search_error"; code: string }
  | { type: "load_more_start" }
  | { type: "load_more_success"; messages: MessageSearchHit[]; hasMore: boolean; nextCursor: string | null }
  | { type: "load_more_error"; code: string };

export function searchReducer(state: SearchUiState, action: SearchAction): SearchUiState {
  switch (action.type) {
    case "set_query":
      return { ...state, query: action.query };
    case "search_start":
      return { ...state, loading: true, errorCode: null };
    case "search_success":
      return {
        ...state,
        loading: false,
        errorCode: null,
        person: action.payload.person,
        conversations: action.payload.conversations,
        messages: action.payload.messages,
        messagesHasMore: action.payload.messagesHasMore,
        nextMessageCursor: action.payload.nextMessageCursor,
      };
    case "search_error":
      return {
        ...state,
        loading: false,
        errorCode: action.code,
      };
    case "load_more_start":
      return { ...state, loadingMore: true, errorCode: null };
    case "load_more_success":
      return {
        ...state,
        loadingMore: false,
        messages: [...state.messages, ...action.messages],
        messagesHasMore: action.hasMore,
        nextMessageCursor: action.nextCursor,
      };
    case "load_more_error":
      return { ...state, loadingMore: false, errorCode: action.code };
    default:
      return state;
  }
}
