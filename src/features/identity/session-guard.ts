import "server-only";

import type { User } from "@supabase/supabase-js";

import { callRpc, type RpcClient } from "@/platform/rpc";
import { err, ok, type Result } from "@/platform/result";

import { readDeviceId } from "./device-cookie";

/**
 * Gate for `/app` access: verified email and a non-revoked device row.
 * The app layout or middleware should call this (shell-owned integration point).
 */
export async function assertAppAccess(
  rpc: RpcClient,
  user: User,
): Promise<Result<void>> {
  if (!user.email_confirmed_at) {
    return err("identity.confirmation_required");
  }

  const deviceId = await readDeviceId();
  const deviceCheck = await callRpc<null>(rpc, "identity_assert_device_active", {
    p_device_id: deviceId ?? null,
  });

  if (!deviceCheck.ok) {
    return deviceCheck;
  }

  return ok(undefined);
}
