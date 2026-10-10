import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";

import { asRpcClient, callRpc, type RpcClient } from "@/platform/rpc";
import { tryCreateSupabaseServerClient } from "@/platform/supabase/safe-server";

export type SessionContext = {
  user: User;
  userId: string;
  supabase: SupabaseClient;
  rpc: RpcClient;
};

export const SESSION_REVOKED_CODE = "identity.session_revoked";
export const SESSION_REVOKED_LOGIN_PATH = `/login?reason=${SESSION_REVOKED_CODE}`;

export type SessionResolution =
  | { status: "active"; context: SessionContext }
  | { status: "anonymous" }
  | { status: "revoked" };

type AuthLike = Pick<SupabaseClient, "auth">;

/**
 * Who is calling and whether their auth session is still live. A session is
 * "revoked" when Supabase no longer knows it (the device was revoked and its
 * auth session deleted) or its device row is revoked.
 */
export async function resolveSession(
  supabase: AuthLike,
  rpc: RpcClient,
): Promise<SessionResolution> {
  const { data, error } = await supabase.auth.getUser();
  const user = data?.user ?? null;
  if (!user) {
    const code = (error as { code?: string } | null)?.code;
    return code === "session_not_found"
      ? { status: "revoked" }
      : { status: "anonymous" };
  }

  const check = await callRpc<null>(rpc, "identity_assert_session_active");
  if (!check.ok) {
    return check.error.code === SESSION_REVOKED_CODE
      ? { status: "revoked" }
      : { status: "anonymous" };
  }

  return {
    status: "active",
    context: {
      user,
      userId: user.id,
      supabase: supabase as SupabaseClient,
      rpc,
    },
  };
}

/**
 * The signed-in member for this request, or null when anonymous or when
 * Supabase is not configured. Cached per request.
 *
 * A revoked session is signed out locally and redirected to
 * `/login?reason=identity.session_revoked`, from pages and server actions
 * alike, so every caller refuses it.
 */
export const getSessionContext = cache(
  async (): Promise<SessionContext | null> => {
    const supabase = await tryCreateSupabaseServerClient();
    if (!supabase) {
      return null;
    }
    let resolution: SessionResolution;
    try {
      resolution = await resolveSession(supabase, asRpcClient(supabase));
    } catch {
      return null;
    }
    if (resolution.status === "revoked") {
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // Cookies may be read-only here; the session is already dead server-side.
      }
      redirect(SESSION_REVOKED_LOGIN_PATH);
    }
    return resolution.status === "active" ? resolution.context : null;
  },
);
