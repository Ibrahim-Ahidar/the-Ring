"use server";

import { getSessionContext } from "@/platform/session";

import {
  clearAllRecentSearches,
  clearRecentSearch,
  favorite,
  listFavorites,
  listRecentSearches,
  searchByUsername,
  unfavorite,
} from "./service";
import type {
  FavoriteContact,
  RecentSearch,
  SearchCard,
} from "./types";

async function requireSession() {
  const session = await getSessionContext();
  if (!session) {
    return null;
  }
  return session;
}

export async function searchByUsernameAction(
  raw: string,
): Promise<
  | { ok: true; value: SearchCard | null }
  | { ok: false; error: { code: string } }
> {
  const session = await requireSession();
  if (!session) {
    return { ok: false, error: { code: "platform.unauthenticated" } };
  }
  return searchByUsername(session.rpc, raw);
}

export async function listRecentSearchesAction(): Promise<
  | { ok: true; value: RecentSearch[] }
  | { ok: false; error: { code: string } }
> {
  const session = await requireSession();
  if (!session) {
    return { ok: false, error: { code: "platform.unauthenticated" } };
  }
  return listRecentSearches(session.rpc);
}

export async function clearRecentSearchAction(
  recentId: string,
): Promise<{ ok: true } | { ok: false; error: { code: string } }> {
  const session = await requireSession();
  if (!session) {
    return { ok: false, error: { code: "platform.unauthenticated" } };
  }
  const result = await clearRecentSearch(session.rpc, recentId);
  if (!result.ok) {
    return result;
  }
  return { ok: true };
}

export async function clearAllRecentSearchesAction(): Promise<
  { ok: true } | { ok: false; error: { code: string } }
> {
  const session = await requireSession();
  if (!session) {
    return { ok: false, error: { code: "platform.unauthenticated" } };
  }
  const result = await clearAllRecentSearches(session.rpc);
  if (!result.ok) {
    return result;
  }
  return { ok: true };
}

export async function listFavoritesAction(): Promise<
  | { ok: true; value: FavoriteContact[] }
  | { ok: false; error: { code: string } }
> {
  const session = await requireSession();
  if (!session) {
    return { ok: false, error: { code: "platform.unauthenticated" } };
  }
  return listFavorites(session.rpc);
}

export async function favoriteAction(
  username: string,
): Promise<
  | { ok: true; value: { favoriteUserId: string; createdAt: string } }
  | { ok: false; error: { code: string } }
> {
  const session = await requireSession();
  if (!session) {
    return { ok: false, error: { code: "platform.unauthenticated" } };
  }
  return favorite(session.rpc, username);
}

export async function unfavoriteAction(
  username: string,
): Promise<{ ok: true } | { ok: false; error: { code: string } }> {
  const session = await requireSession();
  if (!session) {
    return { ok: false, error: { code: "platform.unauthenticated" } };
  }
  const result = await unfavorite(session.rpc, username);
  if (!result.ok) {
    return result;
  }
  return { ok: true };
}
