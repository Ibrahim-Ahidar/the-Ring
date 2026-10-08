"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";

import { searchGlobalAction } from "../actions";
import {
  initialSearchState,
  searchReducer,
  type SearchUiState,
} from "./search-reducer";

const DEBOUNCE_MS = 300;

type SearchContextValue = {
  state: SearchUiState;
  setQuery: (query: string) => void;
  submitSearch: () => Promise<void>;
  loadMoreMessages: () => Promise<void>;
};

const SearchContext = createContext<SearchContextValue | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(searchReducer, initialSearchState);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipDebounceRef = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  const runSearch = useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      dispatch({
        type: "search_success",
        payload: {
          person: null,
          conversations: [],
          messages: [],
          messagesHasMore: false,
          nextMessageCursor: null,
        },
      });
      return;
    }

    dispatch({ type: "search_start" });
    const result = await searchGlobalAction({ query: trimmed });
    if (!result.ok) {
      dispatch({ type: "search_error", code: result.error.code });
      return;
    }

    dispatch({
      type: "search_success",
      payload: {
        person: result.value.person,
        conversations: result.value.conversations,
        messages: result.value.messages,
        messagesHasMore: result.value.messagesHasMore,
        nextMessageCursor: result.value.nextMessageCursor,
      },
    });
  }, []);

  const setQuery = useCallback(
    (query: string) => {
      dispatch({ type: "set_query", query });
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (skipDebounceRef.current) {
        skipDebounceRef.current = false;
        void runSearch(query);
        return;
      }
      debounceRef.current = setTimeout(() => {
        void runSearch(query);
      }, DEBOUNCE_MS);
    },
    [runSearch],
  );

  const submitSearch = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    skipDebounceRef.current = true;
    await runSearch(stateRef.current.query);
  }, [runSearch]);

  const loadMoreMessages = useCallback(async () => {
    const current = stateRef.current;
    if (!current.nextMessageCursor || current.loadingMore) {
      return;
    }
    dispatch({ type: "load_more_start" });
    const result = await searchGlobalAction({
      query: current.query,
      cursor: current.nextMessageCursor,
    });
    if (!result.ok) {
      dispatch({ type: "load_more_error", code: result.error.code });
      return;
    }
    dispatch({
      type: "load_more_success",
      messages: result.value.messages,
      hasMore: result.value.messagesHasMore,
      nextCursor: result.value.nextMessageCursor,
    });
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const value = useMemo(
    () => ({ state, setQuery, submitSearch, loadMoreMessages }),
    [state, setQuery, submitSearch, loadMoreMessages],
  );

  return (
    <SearchContext.Provider value={value}>{children}</SearchContext.Provider>
  );
}

export function useSearch(): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) {
    throw new Error("useSearch requires SearchProvider");
  }
  return ctx;
}
