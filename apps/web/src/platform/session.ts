import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { loginPath } from "@/platform/login-redirect";
import { asRpcClient, callRpc, type RpcClient } from "@pulse/core/rpc";
import { tryCreateSupabaseServerClient } from "@/platform/supabase/safe-server";

export const DEVICE_COOKIE_NAME = "pulse_device_id";

/** The signed-in member as far as the verified JWT claims tell us. */
export type SessionUser = { id: string; email: string | null };

/** What `identity_assert_access` reports; the layout turns it into redirects. */
export type SessionAccess = {
  emailConfirmed: boolean;
  mfaRequired: boolean;
  deviceActive: boolean;
  deviceId: string | undefined;
};

export type SessionContext = {
  user: SessionUser;
  userId: string;
  supabase: SupabaseClient;
  rpc: RpcClient;
  access: SessionAccess;
};

export const SESSION_REVOKED_CODE = "identity.session_revoked";
export const SESSION_REVOKED_LOGIN_PATH = loginPath({ reason: SESSION_REVOKED_CODE });

export type SessionResolution =
  | { status: "active"; context: SessionContext }
  | { status: "anonymous" }
  | { status: "revoked" };

type AuthLike = Pick<SupabaseClient, "auth">;

type AccessRow = {
  email_confirmed?: boolean;
  mfa_required?: boolean;
  device_active?: boolean;
};

/**
 * Who is calling and whether their auth session is still live, in one Supabase
 * round trip. The JWT is verified locally (`getClaims`); everything the JWT
 * cannot prove (session revoked, device revoked, email confirmed, a verified
 * factor needing AAL2) is answered by a single RPC against the database.
 * A session is "revoked" when Supabase no longer knows it or its device row
 * is revoked.
 */
export async function resolveSession(
  supabase: AuthLike,
  rpc: RpcClient,
  deviceId?: string,
): Promise<SessionResolution> {
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims ?? null;
  if (!claims?.sub) {
    const code = (error as { code?: string } | null)?.code;
    return code === "session_not_found"
      ? { status: "revoked" }
      : { status: "anonymous" };
  }

  const check = await callRpc<AccessRow>(rpc, "identity_assert_access", {
    p_device_id: deviceId ?? null,
  });
  if (!check.ok) {
    return check.error.code === SESSION_REVOKED_CODE
      ? { status: "revoked" }
      : { status: "anonymous" };
  }

  const row = check.value ?? {};
  const email = typeof claims.email === "string" && claims.email ? claims.email : null;
  return {
    status: "active",
    context: {
      user: { id: claims.sub, email },
      userId: claims.sub,
      supabase: supabase as SupabaseClient,
      rpc,
      access: {
        emailConfirmed: row.email_confirmed === true,
        mfaRequired: row.mfa_required === true,
        deviceActive: row.device_active === true,
        deviceId,
      },
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
      const deviceId = (await cookies()).get(DEVICE_COOKIE_NAME)?.value;
      resolution = await resolveSession(supabase, asRpcClient(supabase), deviceId);
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
