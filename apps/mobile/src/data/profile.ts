import {
  AVATARS_BUCKET,
  avatarExtension,
  callRpc,
  changeUsername,
  ok,
  clearAllRecentSearches,
  clearAvatar,
  clearRecentSearch,
  err,
  favorite,
  getOwnProfile,
  getProfile,
  listFavorites,
  listRecentSearches,
  openDirect,
  resolveAvatarUrl,
  searchByUsername,
  setAvatarPath,
  unfavorite,
  updateProfile,
  validateAvatarUpload,
  type Result,
} from "@pulse/core";

import { supabase } from "./client";
import { newClientId } from "./chats";
import { rpcClient } from "./rpc";

export const searchUser = (raw: string) => searchByUsername(rpcClient, raw);
export const listContacts = () => listFavorites(rpcClient);
export const addContact = (username: string) => favorite(rpcClient, username);
export const removeContact = (username: string) => unfavorite(rpcClient, username);
export const getUserProfile = (username: string) => getProfile(rpcClient, username);
export const listRecents = () => listRecentSearches(rpcClient);
export const clearRecent = (recentId: string) => clearRecentSearch(rpcClient, recentId);
export const clearAllRecents = () => clearAllRecentSearches(rpcClient);
export const startDirectChat = (username: string) => openDirect(rpcClient, { username });

export const getMyProfile = () => getOwnProfile(rpcClient);
export const saveMyProfile = (input: { displayName: string; bio: string; timezone?: string }) =>
  updateProfile(rpcClient, input);
export const changeMyUsername = (username: string) => changeUsername(rpcClient, username);

/** Same RPC as the web identity deleteAccount: anonymizes the account once the typed username matches. */
export async function deleteMyAccount(usernameConfirm: string): Promise<Result<void>> {
  const result = await callRpc<null>(rpcClient, "identity_delete_account", { p_username_confirm: usernameConfirm });
  return result.ok ? ok(undefined) : result;
}

/** Public URL for a stored avatar value, or null (show initials). */
export function avatarUrl(value: string | null | undefined): string | null {
  return resolveAvatarUrl(value, process.env.EXPO_PUBLIC_SUPABASE_URL);
}

/** Uploads a picked image to the avatars bucket and points the profile at it. */
export async function uploadMyAvatar(input: {
  userId: string;
  uri: string;
  mimeType: string;
}): Promise<Result<void>> {
  let blob: Blob;
  try {
    blob = await (await fetch(input.uri)).blob();
  } catch {
    return err("identity.avatar_rejected");
  }
  const valid = validateAvatarUpload(input.mimeType, blob.size);
  if (!valid.ok) return valid;
  const objectName = `${input.userId}/${newClientId()}.${avatarExtension(input.mimeType)}`;
  const { error } = await supabase.storage
    .from(AVATARS_BUCKET)
    .upload(objectName, blob, { contentType: input.mimeType, upsert: false });
  if (error) return err("identity.avatar_rejected");
  return setAvatarPath(rpcClient, `${AVATARS_BUCKET}/${objectName}`);
}

export async function removeMyAvatar(): Promise<Result<void>> {
  const cleared = await clearAvatar(rpcClient);
  return cleared.ok ? { ok: true, value: undefined } : cleared;
}
