import type { SupabaseClient } from "@supabase/supabase-js";

import {
  IMAGE_MAX_BYTES,
  IMAGE_MIME_TYPES,
  validateAttachment,
} from "@/platform/media";
import { callRpc, type RpcClient } from "@/platform/rpc";
import { err, ok, type Result } from "@/platform/result";
import { reportError } from "@/platform/telemetry";
import { validateUsername } from "@/platform/username";

import { meetsPasswordPolicy } from "./password-policy";
import { emailError } from "./validation";
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
  if (!meetsPasswordPolicy(input.password)) {
    return err("identity.password_weak");
  }

  // Cheap checks first: every Supabase call below counts against a rate limit.
  const email = input.email.trim();
  if (!email) {
    return err("identity.email_required");
  }

  const rate = await enforceSignupRateLimit(serverRpc, email);
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
    email,
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
    return err(await mapSignUpError(error));
  }

  // With confirmation on, an already-confirmed email gets no error from Supabase:
  // it returns an obfuscated user with no identities and sends nothing.
  if (data.user && data.user.identities?.length === 0) {
    return err("identity.email_registered");
  }

  const needsEmailConfirmation = !data.user?.email_confirmed_at;
  return ok({ needsEmailConfirmation });
}

/** Maps an `auth.signUp` error by its `AuthApiError` code. */
export async function mapSignUpError(error: AuthFailure): Promise<string> {
  switch (error.code) {
    case "weak_password":
      return "identity.password_weak";
    case "email_address_invalid":
    case "validation_failed":
      return "identity.email_invalid";
    // The built-in mailer only delivers to project team members.
    case "email_address_not_authorized":
      return "identity.email_undeliverable";
    case "user_already_exists":
    case "email_exists":
      return "identity.email_registered";
    default:
      return mapCommonAuthError(error, "identity.sign_up");
  }
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

type AuthFailure = { code?: string; status?: number };

const RATE_LIMIT_CODES = new Set([
  "over_request_rate_limit",
  "over_email_send_rate_limit",
]);

/** Shared mapping for auth errors that mean "slow down"; anything unknown is reported. */
async function mapCommonAuthError(
  error: AuthFailure,
  operation: string,
): Promise<string> {
  if (error.status === 429 || (error.code && RATE_LIMIT_CODES.has(error.code))) {
    return "platform.rate_limited";
  }
  await reportError(error, {
    operation,
    authCode: error.code ?? null,
    status: error.status ?? null,
  });
  return "platform.unexpected";
}

/** Maps a `signInWithPassword` error by its `AuthApiError` code, never its message. */
export async function mapSignInError(error: AuthFailure): Promise<string> {
  // Credentials stay one message for both fields; the other cases do not reveal a field.
  if (error.code === "invalid_credentials") {
    return "identity.credentials_rejected";
  }
  if (error.code === "email_not_confirmed") {
    return "identity.confirmation_required";
  }
  return mapCommonAuthError(error, "identity.sign_in");
}

/**
 * Maps a `verifyOtp` error. GoTrue answers `otp_expired` for both wrong and expired
 * codes, so that case gets one message covering both.
 */
export async function mapVerifyCodeError(error: AuthFailure): Promise<string> {
  if (error.code === "otp_expired") {
    return "identity.code_expired";
  }
  if (error.code === "invalid_otp" || error.code === "validation_failed") {
    return "identity.code_invalid";
  }
  return mapCommonAuthError(error, "identity.verify_code");
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
    return err(await mapSignInError(error));
  }

  return registerSignedInDevice(supabase, rpc, input.deviceLabel, deviceId, newDeviceId);
}

const SIGNUP_CODE = /^\d{6}$/;

/**
 * Confirms a new account with the 6-digit code from the signup email. On success the
 * member is signed in and the device is registered like a password sign-in.
 */
export async function verifySignupCode(
  supabase: SupabaseClient,
  rpc: RpcClient,
  input: { email: string; token: string; deviceLabel?: string },
  deviceId: string | undefined,
  newDeviceId?: () => string,
): Promise<Result<string>> {
  const token = input.token.trim();
  if (!SIGNUP_CODE.test(token)) {
    return err("identity.code_invalid");
  }

  const { error } = await supabase.auth.verifyOtp({
    email: input.email.trim(),
    token,
    type: "signup",
  });
  if (error) {
    return err(await mapVerifyCodeError(error));
  }

  return registerSignedInDevice(supabase, rpc, input.deviceLabel, deviceId, newDeviceId);
}

/** Sends a new signup code. Unknown emails succeed silently on the Supabase side. */
export async function resendSignupCode(
  supabase: SupabaseClient,
  email: string,
): Promise<Result<void>> {
  const trimmed = email.trim();
  if (!trimmed) {
    return err("identity.credentials_rejected");
  }
  const { error } = await supabase.auth.resend({ type: "signup", email: trimmed });
  if (error) {
    return err(await mapCommonAuthError(error, "identity.resend_code"));
  }
  return ok(undefined);
}

async function registerSignedInDevice(
  supabase: SupabaseClient,
  rpc: RpcClient,
  deviceLabel: string | undefined,
  deviceId: string | undefined,
  newDeviceId?: () => string,
): Promise<Result<string>> {
  const device = await registerDevice(
    rpc,
    deviceId,
    deviceLabel ?? null,
    newDeviceId,
  );

  if (!device.ok) {
    await supabase.auth.signOut();
  }
  return device;
}

/**
 * Sends the recovery email (6-digit code; the link in `redirectTo` is a fallback).
 * Unknown emails succeed silently on the Supabase side, so this never reveals accounts.
 */
export async function requestPasswordReset(
  supabase: SupabaseClient,
  email: string,
  redirectTo: string,
): Promise<Result<void>> {
  const trimmed = email.trim();
  if (!trimmed) {
    return err("identity.email_required");
  }

  const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
    redirectTo,
  });

  if (error) {
    return err(await mapCommonAuthError(error, "identity.request_password_reset"));
  }

  return ok(undefined);
}

/**
 * Checks the 6-digit code from the recovery email. On success the member is signed in
 * (registered like a password sign-in) so the next screen can set a new password.
 */
export async function verifyRecoveryCode(
  supabase: SupabaseClient,
  rpc: RpcClient,
  input: { email: string; token: string; deviceLabel?: string },
  deviceId: string | undefined,
  newDeviceId?: () => string,
): Promise<Result<string>> {
  const token = input.token.trim();
  if (!SIGNUP_CODE.test(token)) {
    return err("identity.code_invalid");
  }

  const { error } = await supabase.auth.verifyOtp({
    email: input.email.trim(),
    token,
    type: "recovery",
  });
  if (error) {
    return err(await mapVerifyCodeError(error));
  }

  return registerSignedInDevice(supabase, rpc, input.deviceLabel, deviceId, newDeviceId);
}

/** Maps an `updateUser({ password })` error by its `AuthApiError` code. */
export async function mapUpdatePasswordError(error: AuthFailure): Promise<string> {
  if (error.code === "weak_password") {
    return "identity.password_weak";
  }
  if (error.code === "same_password") {
    return "identity.password_same";
  }
  if (error.code === "reauthentication_needed") {
    return "identity.reauthentication_needed";
  }
  if (error.code === "session_not_found" || error.status === 401) {
    return "identity.reset_session_expired";
  }
  return mapCommonAuthError(error, "identity.update_password");
}

/** Maps an `updateUser({ email })` error by its `AuthApiError` code. */
export async function mapChangeEmailError(error: AuthFailure): Promise<string> {
  if (error.code === "email_exists") {
    return "identity.email_taken";
  }
  if (error.code === "email_address_invalid") {
    return "identity.email_invalid";
  }
  // The hosted default mailer only delivers to project team members.
  if (error.code === "email_address_not_authorized") {
    return "identity.email_not_authorized";
  }
  return mapCommonAuthError(error, "identity.change_email");
}

/** Ends every other auth session and revokes every other device row. */
async function signOutOtherDevices(
  supabase: SupabaseClient,
  rpc: RpcClient,
  currentDeviceId: string | undefined,
): Promise<void> {
  const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
  if (signOutError) {
    await reportError(signOutError, { operation: "identity.sign_out_others" });
  }

  const devices = await listSessions(rpc);
  if (devices.ok) {
    for (const device of devices.value) {
      if (device.id !== currentDeviceId && !device.revoked_at) {
        await revokeSession(rpc, device.id);
      }
    }
  }
}

/**
 * Sets a new password for the signed-in member, then signs out every other session:
 * Supabase refresh tokens (`scope: "others"`) and the app's device rows except this one.
 */
export async function updatePassword(
  supabase: SupabaseClient,
  rpc: RpcClient,
  password: string,
  currentDeviceId: string | undefined,
): Promise<Result<void>> {
  if (!meetsPasswordPolicy(password)) {
    return err("identity.password_weak");
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return err(await mapUpdatePasswordError(error));
  }

  await signOutOtherDevices(supabase, rpc, currentDeviceId);
  return ok(undefined);
}

/**
 * Changes a signed-in member's password after checking the current one, and returns
 * the device id now bound to the session. Signing in again proves the current
 * password and makes this a recent login, which `secure_password_change` requires;
 * the device row is re-bound to that new session.
 */
export async function changePassword(
  supabase: SupabaseClient,
  rpc: RpcClient,
  input: { email: string; currentPassword: string; newPassword: string; signOutOthers: boolean },
  deviceId: string | undefined,
): Promise<Result<string>> {
  if (!input.currentPassword) {
    return err("identity.password_required");
  }
  if (!meetsPasswordPolicy(input.newPassword)) {
    return err("identity.password_weak");
  }
  if (input.newPassword === input.currentPassword) {
    return err("identity.password_same");
  }

  const { data: before } = await supabase.auth.getSession();
  const replacedToken = before.session?.access_token;

  const reauth = await signIn(
    supabase,
    rpc,
    { email: input.email, password: input.currentPassword },
    deviceId,
  );
  if (!reauth.ok) {
    return reauth.error.code === "identity.credentials_rejected"
      ? err("identity.current_password_wrong")
      : reauth;
  }

  const { error } = await supabase.auth.updateUser({ password: input.newPassword });
  if (error) {
    return err(await mapUpdatePasswordError(error));
  }

  if (input.signOutOthers) {
    await signOutOtherDevices(supabase, rpc, reauth.value);
  } else if (replacedToken) {
    // The session the sign-in replaced has no cookie left; end it rather than let it linger.
    const { error: endError } = await supabase.auth.admin.signOut(replacedToken, "local");
    if (endError) {
      await reportError(endError, { operation: "identity.end_replaced_session" });
    }
  }

  return ok(reauth.value);
}

/**
 * Starts an email change. With `double_confirm_changes` both addresses get a link;
 * the address switches once both are confirmed.
 */
export async function changeEmail(
  supabase: SupabaseClient,
  currentEmail: string | undefined,
  email: string,
  redirectTo: string,
): Promise<Result<{ pendingEmail: string }>> {
  const invalid = emailError(email);
  if (invalid) {
    return err(invalid);
  }
  const trimmed = email.trim();
  if (currentEmail && trimmed.toLowerCase() === currentEmail.toLowerCase()) {
    return err("identity.email_same");
  }

  const { data, error } = await supabase.auth.updateUser(
    { email: trimmed },
    { emailRedirectTo: redirectTo },
  );
  if (error) {
    return err(await mapChangeEmailError(error));
  }
  return ok({ pendingEmail: data.user?.new_email ?? trimmed });
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

/** Revokes every device except the current one; returns how many were revoked. */
export async function revokeOtherSessions(
  rpc: RpcClient,
  currentDeviceId: string | undefined,
): Promise<Result<number>> {
  const result = await callRpc<number>(rpc, "identity_revoke_other_devices", {
    p_current_device_id: currentDeviceId ?? null,
  });
  if (!result.ok) {
    return result;
  }
  return ok(result.value ?? 0);
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
