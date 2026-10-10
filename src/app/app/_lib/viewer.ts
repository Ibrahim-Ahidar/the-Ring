import * as identity from "@/features/identity/service";
import type { RpcClient } from "@/platform/rpc";

export type Viewer = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
};

/** Signed-in member's own profile summary for headers; null when unavailable. */
export async function loadViewer(rpc: RpcClient): Promise<Viewer | null> {
  const result = await identity.getOwnProfile(rpc);
  if (!result.ok || !result.value) {
    return null;
  }
  const profile = result.value;
  return {
    id: profile.id,
    username: profile.username,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url,
    bio: profile.bio,
  };
}
