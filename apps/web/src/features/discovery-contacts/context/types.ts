import type {
  FavoriteContact,
  RecentSearch,
  SearchCard,
} from "../types";

export type DiscoveryState = {
  query: string;
  result: SearchCard | null;
  recents: RecentSearch[];
  favorites: FavoriteContact[];
  searching: boolean;
  searchError: string | null;
  favoritesLoading: boolean;
};

export type DiscoveryAction =
  | { type: "set_query"; query: string }
  | { type: "search_start" }
  | { type: "search_success"; result: SearchCard | null; recents: RecentSearch[] }
  | { type: "search_error"; code: string }
  | { type: "set_recents"; recents: RecentSearch[] }
  | { type: "set_favorites"; favorites: FavoriteContact[] }
  | { type: "favorites_loading"; loading: boolean };

export const initialDiscoveryState = (
  recents: RecentSearch[],
  favorites: FavoriteContact[],
): DiscoveryState => ({
  query: "",
  result: null,
  recents,
  favorites,
  searching: false,
  searchError: null,
  favoritesLoading: false,
});

export function discoveryReducer(
  state: DiscoveryState,
  action: DiscoveryAction,
): DiscoveryState {
  switch (action.type) {
    case "set_query":
      return { ...state, query: action.query, searchError: null };
    case "search_start":
      return { ...state, searching: true, searchError: null };
    case "search_success":
      return {
        ...state,
        searching: false,
        result: action.result,
        recents: action.recents,
      };
    case "search_error":
      return { ...state, searching: false, searchError: action.code };
    case "set_recents":
      return { ...state, recents: action.recents };
    case "set_favorites":
      return { ...state, favorites: action.favorites, favoritesLoading: false };
    case "favorites_loading":
      return { ...state, favoritesLoading: action.loading };
    default:
      return state;
  }
}
