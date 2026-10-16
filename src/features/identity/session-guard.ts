import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

import { callRpc, type RpcClient } from "@/platform/rpc";
import { err, ok, type Result } from "@/platform/result";

import { readDeviceId } from "./device-cookie";
import { MFA_REQUIRED, needsSecondFactor } from "./service";

/**
 * Gate for `/app` access: verified email, AAL2 for members with a second factor, and a non-revoked device row.
 * The app layout or middleware should call this (shell-owned integration point).
 */
export async function assertAppAccess(
  rpc: RpcClient,
  user: User,
  supabase?: SupabaseClient,
): Promise<Result<void>> {
  if (!user.email_confirmed_at) {
    return err("identity.confirmation_required");
  }

  // A member with a verified authenticator must step up to AAL2 first.
  if (supabase && (await needsSecondFactor(supabase))) {
    return err(MFA_REQUIRED);
  }

  const deviceId = await readDeviceId();
  const deviceCheck = await callRpc<null>(rpc, "identity_assert_device_active", {
    p_device_id: deviceId ?? null,
  });

  if (!deviceCheck.ok) {
    return deviceCheck;
  }

  // Keeps "Last active" current; the RPC writes at most every 5 minutes.
  // A failed touch must not lock the member out, so its result is ignored.
  await callRpc<null>(rpc, "identity_touch_device", { p_device_id: deviceId });

  return ok(undefined);
}
