import { callRpc, type RpcClient } from "./rpc";
import type { Result } from "./result";

import type {
  FavoriteContact,
  ProfileView,
  RecentSearch,
  SearchCard,
} from "./contacts-types";

type SearchCardRow = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
};

type ProfileRow = SearchCardRow & {
  is_online?: boolean;
  last_seen_at?: string | null;
  shared_groups?: SharedGroupRow[];
  is_favorited?: boolean;
};

type SharedGroupRow = {
  id: string;
  title: string | null;
};

type RecentSearchRow = {
  id: string;
  normalized_username: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
};

type FavoriteRow = {
  favorite_user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
};

function mapSearchCard(row: SearchCardRow): SearchCard {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
  };
}

function mapProfile(row: ProfileRow): ProfileView {
  const base = mapSearchCard(row);
  const profile: ProfileView = { ...base };
  if (row.is_online !== undefined) {
    profile.isOnline = row.is_online;
  }
  if (row.last_seen_at !== undefined) {
    profile.lastSeenAt = row.last_seen_at;
  }
  if (row.shared_groups !== undefined) {
    profile.sharedGroups = row.shared_groups.map((g) => ({
      id: g.id,
      title: g.title,
    }));
  }
  if (row.is_favorited !== undefined) {
    profile.isFavorited = row.is_favorited;
  }
  return profile;
}

function mapRecent(row: RecentSearchRow): RecentSearch {
  return {
    id: row.id,
    normalizedUsername: row.normalized_username,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
  };
}

function mapFavorite(row: FavoriteRow): FavoriteContact {
  return {
    favoriteUserId: row.favorite_user_id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
  };
}

export async function searchByUsername(
  rpc: RpcClient,
  raw: string,
): Promise<Result<SearchCard | null>> {
  const result = await callRpc<SearchCardRow | null>(
    rpc,
    "discovery_search_by_username",
    { p_raw: raw },
  );
  if (!result.ok) {
    return result;
  }
  if (result.value === null) {
    return { ok: true, value: null };
  }
  return { ok: true, value: mapSearchCard(result.value) };
}

export async function listRecentSearches(
  rpc: RpcClient,
): Promise<Result<RecentSearch[]>> {
  const result = await callRpc<RecentSearchRow[]>(
    rpc,
    "discovery_list_recent_searches",
  );
  if (!result.ok) {
    return result;
  }
  return { ok: true, value: (result.value ?? []).map(mapRecent) };
}

export async function clearRecentSearch(
  rpc: RpcClient,
  recentId: string,
): Promise<Result<void>> {
  const result = await callRpc<null>(rpc, "discovery_clear_recent_search", {
    p_recent_id: recentId,
  });
  if (!result.ok) {
    return result;
  }
  return { ok: true, value: undefined };
}

export async function clearAllRecentSearches(
  rpc: RpcClient,
): Promise<Result<void>> {
  const result = await callRpc<null>(rpc, "discovery_clear_all_recent_searches");
  if (!result.ok) {
    return result;
  }
  return { ok: true, value: undefined };
}

export async function getProfile(
  rpc: RpcClient,
  username: string,
): Promise<Result<ProfileView>> {
  const result = await callRpc<ProfileRow>(rpc, "discovery_get_profile", {
    p_username: username,
  });
  if (!result.ok) {
    return result;
  }
  return { ok: true, value: mapProfile(result.value) };
}

export async function listFavorites(
  rpc: RpcClient,
): Promise<Result<FavoriteContact[]>> {
  const result = await callRpc<FavoriteRow[]>(rpc, "discovery_list_favorites");
  if (!result.ok) {
    return result;
  }
  return { ok: true, value: (result.value ?? []).map(mapFavorite) };
}

export async function favorite(
  rpc: RpcClient,
  username: string,
): Promise<Result<{ favoriteUserId: string; createdAt: string }>> {
  const result = await callRpc<{
    favorite_user_id: string;
    created_at: string;
  }>(rpc, "discovery_favorite", { p_username: username });
  if (!result.ok) {
    return result;
  }
  return {
    ok: true,
    value: {
      favoriteUserId: result.value.favorite_user_id,
      createdAt: result.value.created_at,
    },
  };
}

export async function unfavorite(
  rpc: RpcClient,
  username: string,
): Promise<Result<void>> {
  const result = await callRpc<null>(rpc, "discovery_unfavorite", {
    p_username: username,
  });
  if (!result.ok) {
    return result;
  }
  return { ok: true, value: undefined };
}
