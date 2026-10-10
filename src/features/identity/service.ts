import type { SupabaseClient } from "@supabase/supabase-js";

import {
  IMAGE_MAX_BYTES,
  IMAGE_MIME_TYPES,
  validateAttachment,
} from "@/platform/media";
import { callRpc, type RpcClient } from "@/platform/rpc";
import { err, ok, type Result } from "@/platform/result";
import { validateUsername } from "@/platform/username";

import type {
  DeviceSession,
  OwnProfile,
  SignInInput,
  SignUpInput,
  SignUpResult,
} from "./types";

export async function checkUsernameAvailable(
  rpc: RpcClient,
  username: string,
): Promise<Result<boolean>> {
  const validated = validateUsername(username);
  if (!validated.ok) {
    return validated;
  }

  return callRpc<boolean>(rpc, "identity_is_username_available", {
    p_username: username,
  });
}

export async function enforceSignupRateLimit(
  rpc: RpcClient,
  email: string,
): Promise<Result<void>> {
  const result = await callRpc<null>(rpc, "identity_enforce_signup_rate_limit", {
    p_email: email,
  });
  if (!result.ok) {
    return result;
  }
  return ok(undefined);
}

/** `serverRpc` must be a service-role client; the signup limiter is not callable by browsers. */
export async function signUp(
  supabase: SupabaseClient,
  rpc: RpcClient,
  input: SignUpInput,
  serverRpc: RpcClient,
): Promise<Result<SignUpResult>> {
  const usernameCheck = validateUsername(input.username);
  if (!usernameCheck.ok) {
    return usernameCheck;
  }

  const rate = await enforceSignupRateLimit(serverRpc, input.email);
  if (!rate.ok) {
    return rate;
  }

  const available = await callRpc<boolean>(rpc, "identity_is_username_available", {
    p_username: input.username,
  });
  if (!available.ok) {
    return available;
  }
  if (!available.value) {
    return err("identity.username_taken");
  }

  const displayName =
    input.displayName?.trim() || usernameCheck.value.display;

  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      data: {
        username: usernameCheck.value.display,
        display_name: displayName,
      },
    },
  });

  if (error) {
    if (error.message.includes("identity.")) {
      return err(error.message);
    }
    return err("platform.unexpected");
  }

  const needsEmailConfirmation = !data.user?.email_confirmed_at;
  return ok({ needsEmailConfirmation });
}

/**
 * Registers the signed-in member's device and returns the id actually used.
 * A device id left in the browser by another account makes the RPC answer
 * `identity.not_found`; in that case a fresh id is generated and tried once.
 */
export async function registerDevice(
  rpc: RpcClient,
  deviceId: string | undefined,
  deviceLabel: string | null = null,
  newDeviceId: () => string = () => globalThis.crypto.randomUUID(),
): Promise<Result<string>> {
  const upsert = (id: string) =>
    callRpc<string>(rpc, "identity_upsert_device", {
      p_device_id: id,
      p_device_label: deviceLabel,
    });

  const firstId = deviceId ?? newDeviceId();
  const first = await upsert(firstId);
  if (first.ok) {
    return ok(firstId);
  }
  if (!deviceId || first.error.code !== "identity.not_found") {
    return first;
  }

  const freshId = newDeviceId();
  const retry = await upsert(freshId);
  return retry.ok ? ok(freshId) : retry;
}

/** Returns the device id the session is registered under; the caller stores it in the cookie. */
export async function signIn(
  supabase: SupabaseClient,
  rpc: RpcClient,
  input: SignInInput,
  deviceId: string | undefined,
  newDeviceId?: () => string,
): Promise<Result<string>> {
  const { error } = await supabase.auth.signInWithPassword({
    email: input.email.trim(),
    password: input.password,
  });

  if (error) {
    return err("identity.credentials_rejected");
  }

  const device = await registerDevice(
    rpc,
    deviceId,
    input.deviceLabel ?? null,
    newDeviceId,
  );

  if (!device.ok) {
    await supabase.auth.signOut();
  }
  return device;
}

export async function requestPasswordReset(
  supabase: SupabaseClient,
  email: string,
  redirectTo: string,
): Promise<Result<void>> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo,
  });

  if (error) {
    return err("platform.unexpected");
  }

  return ok(undefined);
}

export async function signOut(supabase: SupabaseClient): Promise<Result<void>> {
  const { error } = await supabase.auth.signOut();
  if (error) {
    return err("platform.unexpected");
  }
  return ok(undefined);
}

export async function getOwnProfile(
  rpc: RpcClient,
): Promise<Result<OwnProfile | null>> {
  const result = await callRpc<OwnProfile[]>(rpc, "identity_get_own_profile");
  if (!result.ok) {
    return result;
  }
  const rows = result.value;
  if (!rows?.length) {
    return ok(null);
  }
  return ok(rows[0]!);
}

export async function updateProfile(
  rpc: RpcClient,
  input: {
    displayName?: string;
    bio?: string;
    timezone?: string;
  },
): Promise<Result<void>> {
  const result = await callRpc<null>(rpc, "identity_update_profile", {
    p_display_name: input.displayName ?? null,
    p_bio: input.bio ?? null,
    p_timezone: input.timezone ?? null,
  });
  if (!result.ok) {
    return result;
  }
  return ok(undefined);
}

export async function changeUsername(
  rpc: RpcClient,
  username: string,
): Promise<Result<void>> {
  const validated = validateUsername(username);
  if (!validated.ok) {
    return validated;
  }

  const result = await callRpc<null>(rpc, "identity_change_username", {
    p_username: validated.value.display,
  });
  if (!result.ok) {
    return result;
  }
  return ok(undefined);
}

export async function setAvatarPath(
  rpc: RpcClient,
  storagePath: string,
): Promise<Result<void>> {
  const result = await callRpc<null>(rpc, "identity_set_avatar_path", {
    p_storage_path: storagePath,
  });
  if (!result.ok) {
    return result;
  }
  return ok(undefined);
}

/** Clears the caller's photo; returns the previous stored value (if any). */
export async function clearAvatar(
  rpc: RpcClient,
): Promise<Result<string | null>> {
  const result = await callRpc<string | null>(rpc, "identity_clear_avatar");
  if (!result.ok) {
    return result;
  }
  return ok(result.value ?? null);
}

export function validateAvatarUpload(
  mimeType: string,
  sizeBytes: number,
): Result<{ kind: "image" }> {
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return err("identity.avatar_rejected");
  }
  const attachment = validateAttachment({ mimeType, sizeBytes });
  if (!attachment.ok) {
    return err("identity.avatar_rejected");
  }
  if (sizeBytes > IMAGE_MAX_BYTES) {
    return err("identity.avatar_rejected");
  }
  return ok({ kind: "image" });
}

export async function listSessions(
  rpc: RpcClient,
): Promise<Result<DeviceSession[]>> {
  const result = await callRpc<DeviceSession[]>(rpc, "identity_list_devices");
  if (!result.ok) {
    return result;
  }
  return ok(result.value ?? []);
}

export async function revokeSession(
  rpc: RpcClient,
  deviceId: string,
): Promise<Result<void>> {
  const result = await callRpc<null>(rpc, "identity_revoke_device", {
    p_device_id: deviceId,
  });
  if (!result.ok) {
    return result;
  }
  return ok(undefined);
}

export async function touchDevice(
  rpc: RpcClient,
  deviceId: string,
): Promise<Result<void>> {
  const result = await callRpc<null>(rpc, "identity_touch_device", {
    p_device_id: deviceId,
  });
  if (!result.ok) {
    return result;
  }
  return ok(undefined);
}

export async function deleteAccount(
  rpc: RpcClient,
  usernameConfirm: string,
): Promise<Result<void>> {
  const result = await callRpc<null>(rpc, "identity_delete_account", {
    p_username_confirm: usernameConfirm,
  });
  if (!result.ok) {
    return result;
  }
  return ok(undefined);
}

export async function requestDataExport(): Promise<Result<void>> {
  return err("identity.export_unavailable");
}
