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

import {
  clearAllRecentSearchesAction,
  clearRecentSearchAction,
  favoriteAction,
  listFavoritesAction,
  listRecentSearchesAction,
  searchByUsernameAction,
  unfavoriteAction,
} from "../actions";
import type { FavoriteContact, RecentSearch } from "../types";
import {
  discoveryReducer,
  initialDiscoveryState,
  type DiscoveryState,
} from "./types";

const DEBOUNCE_MS = 300;

type DiscoveryContextValue = {
  state: DiscoveryState;
  setQuery: (query: string) => void;
  submitSearch: () => Promise<void>;
  clearRecent: (id: string) => Promise<void>;
  clearAllRecents: () => Promise<void>;
  toggleFavorite: (username: string, favorited: boolean) => Promise<void>;
  refreshFavorites: () => Promise<void>;
};

const DiscoveryContext = createContext<DiscoveryContextValue | null>(null);

export function DiscoveryProvider({
  initialRecents,
  initialFavorites,
  children,
}: {
  initialRecents: RecentSearch[];
  initialFavorites: FavoriteContact[];
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(
    discoveryReducer,
    { recents: initialRecents, favorites: initialFavorites },
    ({ recents, favorites }) => initialDiscoveryState(recents, favorites),
  );

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipDebounceRef = useRef(false);

  const runSearch = useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      dispatch({ type: "search_success", result: null, recents: state.recents });
      return;
    }

    dispatch({ type: "search_start" });
    const searchResult = await searchByUsernameAction(trimmed);
    if (!searchResult.ok) {
      dispatch({ type: "search_error", code: searchResult.error.code });
      return;
    }

    const recentsResult = await listRecentSearchesAction();
    const recents = recentsResult.ok ? recentsResult.value : state.recents;
    dispatch({
      type: "search_success",
      result: searchResult.value,
      recents,
    });
  }, [state.recents]);

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
    await runSearch(state.query);
  }, [runSearch, state.query]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const clearRecent = useCallback(async (id: string) => {
    const result = await clearRecentSearchAction(id);
    if (result.ok) {
      const recents = await listRecentSearchesAction();
      if (recents.ok) {
        dispatch({ type: "set_recents", recents: recents.value });
      }
    }
  }, []);

  const clearAllRecents = useCallback(async () => {
    const result = await clearAllRecentSearchesAction();
    if (result.ok) {
      dispatch({ type: "set_recents", recents: [] });
    }
  }, []);

  const refreshFavorites = useCallback(async () => {
    dispatch({ type: "favorites_loading", loading: true });
    const result = await listFavoritesAction();
    if (result.ok) {
      dispatch({ type: "set_favorites", favorites: result.value });
    } else {
      dispatch({ type: "favorites_loading", loading: false });
    }
  }, []);

  const toggleFavorite = useCallback(
    async (username: string, favorited: boolean) => {
      if (favorited) {
        await unfavoriteAction(username);
      } else {
        await favoriteAction(username);
      }
      await refreshFavorites();
    },
    [refreshFavorites],
  );

  const value = useMemo(
    () => ({
      state,
      setQuery,
      submitSearch,
      clearRecent,
      clearAllRecents,
      toggleFavorite,
      refreshFavorites,
    }),
    [
      state,
      setQuery,
      submitSearch,
      clearRecent,
      clearAllRecents,
      toggleFavorite,
      refreshFavorites,
    ],
  );

  return (
    <DiscoveryContext.Provider value={value}>{children}</DiscoveryContext.Provider>
  );
}

export function useDiscovery(): DiscoveryContextValue {
  const ctx = useContext(DiscoveryContext);
  if (!ctx) {
    throw new Error("useDiscovery requires DiscoveryProvider");
  }
  return ctx;
}
