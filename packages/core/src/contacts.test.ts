import { describe, expect, it, vi } from "vitest";

import { favorite, listFavorites, searchByUsername } from "./contacts";
import type { RpcClient } from "./rpc";

function client(data: unknown) {
  const rpc = vi.fn(async () => ({ data: data ?? null, error: null }));
  return { rpc } as unknown as RpcClient & { rpc: typeof rpc };
}

describe("contacts", () => {
  it("maps a search card and null for no match", async () => {
    const hit = client({ id: "u", username: "ada", display_name: "Ada", avatar_url: null, bio: null });
    expect(await searchByUsername(hit, "ada")).toEqual({
      ok: true,
      value: { id: "u", username: "ada", displayName: "Ada", avatarUrl: null, bio: null },
    });
    expect(hit.rpc).toHaveBeenCalledWith("discovery_search_by_username", { p_raw: "ada" });
    expect(await searchByUsername(client(null), "zzz")).toEqual({ ok: true, value: null });
  });

  it("lists and adds favorites", async () => {
    const list = client([
      { favorite_user_id: "u", username: "ada", display_name: null, avatar_url: null, created_at: "t" },
    ]);
    expect(await listFavorites(list)).toMatchObject({ ok: true, value: [{ favoriteUserId: "u" }] });
    const add = client({ favorite_user_id: "u", created_at: "t" });
    expect(await favorite(add, "ada")).toEqual({ ok: true, value: { favoriteUserId: "u", createdAt: "t" } });
  });
});
