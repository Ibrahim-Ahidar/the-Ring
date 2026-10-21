import { describe, expect, it, vi } from "vitest";

import {
  avatarExtension,
  clearAvatar,
  getOwnProfile,
  resolveAvatarUrl,
  setAvatarPath,
  updateProfile,
  validateAvatarUpload,
} from "./profile";
import type { RpcClient } from "./rpc";

function client(data: unknown) {
  const rpc = vi.fn(async () => ({ data: data ?? null, error: null }));
  return { rpc } as unknown as RpcClient & { rpc: typeof rpc };
}

describe("profile", () => {
  it("returns the first own-profile row or null", async () => {
    expect(await getOwnProfile(client([{ id: "u1" }]))).toMatchObject({ ok: true, value: { id: "u1" } });
    expect(await getOwnProfile(client([]))).toEqual({ ok: true, value: null });
  });

  it("sends profile fields as rpc params", async () => {
    const c = client(null);
    await updateProfile(c, { displayName: "Ada", bio: "hi" });
    expect(c.rpc).toHaveBeenCalledWith("identity_update_profile", {
      p_display_name: "Ada",
      p_bio: "hi",
      p_timezone: null,
    });
  });

  it("sets and clears the avatar", async () => {
    const c = client("avatars/u/old.png");
    await setAvatarPath(c, "avatars/u/a.png");
    expect(c.rpc).toHaveBeenCalledWith("identity_set_avatar_path", { p_storage_path: "avatars/u/a.png" });
    expect(await clearAvatar(c)).toEqual({ ok: true, value: "avatars/u/old.png" });
  });

  it("validates avatar uploads", () => {
    expect(validateAvatarUpload("image/png", 1000).ok).toBe(true);
    expect(validateAvatarUpload("application/pdf", 1000).ok).toBe(false);
    expect(validateAvatarUpload("image/png", 50 * 1024 * 1024).ok).toBe(false);
  });

  it("picks extensions", () => {
    expect(avatarExtension("image/jpeg")).toBe("jpg");
    expect(avatarExtension("image/webp")).toBe("webp");
  });

  it("resolves avatar urls", () => {
    const uid = "0123456789abcdef0123456789abcdef0123";
    expect(resolveAvatarUrl(`avatars/${uid}/a.png`, "https://x.supabase.co/")).toBe(
      `https://x.supabase.co/storage/v1/object/public/avatars/${uid}/a.png`,
    );
    expect(resolveAvatarUrl("https://cdn/a.png", undefined)).toBe("https://cdn/a.png");
    expect(resolveAvatarUrl("junk", "https://x")).toBeNull();
    expect(resolveAvatarUrl(null, "https://x")).toBeNull();
  });
});
