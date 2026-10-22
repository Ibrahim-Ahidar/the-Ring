import * as SecureStore from "expo-secure-store";
import { callRpc, err, mapUpdatePasswordAuthError, meetsPasswordPolicy, ok, type Result } from "@pulse/core";

import { statelessSupabase, supabase } from "./client";
import { rpcClient } from "./rpc";

/** Same key the device lifecycle stores this phone's Device id under. */
const DEVICE_ID_KEY = "pulse.device_id";
const TOTP_CODE = /^\d{6}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MAX_TOTP_FACTORS = 2;

export type DeviceSession = {
  id: string;
  device_label: string | null;
  last_seen_at: string | null;
  revoked_at: string | null;
  created_at: string;
};
export type MfaFactor = { id: string; friendlyName: string };
export type MfaEnrollment = { factorId: string; qrCode: string; secret: string };

type AuthFailure = { code?: string; status?: number } | null | undefined;

export async function currentDeviceId(): Promise<string | null> {
  return SecureStore.getItemAsync(DEVICE_ID_KEY).catch(() => null);
}

export async function listSessions(): Promise<Result<DeviceSession[]>> {
  const result = await callRpc<DeviceSession[]>(rpcClient, "identity_list_devices");
  return result.ok ? ok(result.value ?? []) : result;
}

export async function revokeSession(deviceId: string): Promise<Result<void>> {
  const result = await callRpc<null>(rpcClient, "identity_revoke_device", { p_device_id: deviceId });
  return result.ok ? ok(undefined) : result;
}

export async function revokeOtherSessions(): Promise<Result<number>> {
  const id = await currentDeviceId();
  const result = await callRpc<number>(rpcClient, "identity_revoke_other_devices", { p_current_device_id: id });
  return result.ok ? ok(result.value ?? 0) : result;
}

function mapMfaError(error: AuthFailure): string {
  const code = error?.code;
  if (code === "mfa_verification_failed" || code === "validation_failed" || code === "mfa_challenge_expired") {
    return "identity.mfa_code_wrong";
  }
  return "platform.unexpected";
}

export async function listMfaFactors(): Promise<Result<MfaFactor[]>> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) return err(mapMfaError(error));
  return ok(data.totp.map((factor) => ({ id: factor.id, friendlyName: factor.friendly_name ?? "" })));
}

async function challengeAndVerify(factorId: string, code: string): Promise<Result<void>> {
  if (!TOTP_CODE.test(code.trim())) return err("identity.mfa_code_invalid");
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
  return error ? err(mapMfaError(error)) : ok(undefined);
}

/** Second sign-in step: tries each verified factor, like the web verifySignInMfa. */
export async function verifySignInMfa(code: string): Promise<Result<void>> {
  if (!TOTP_CODE.test(code.trim())) return err("identity.mfa_code_invalid");
  const factors = await listMfaFactors();
  if (!factors.ok) return factors;
  if (factors.value.length === 0) return err("platform.unauthenticated");
  let last: Result<void> = err("identity.mfa_code_wrong");
  for (const factor of factors.value) {
    last = await challengeAndVerify(factor.id, code);
    if (last.ok || last.error.code !== "identity.mfa_code_wrong") return last;
  }
  return last;
}

/** Mirrors the web enrollTotp: enforces the factor limit and drops stale unverified enrollments first. */
export async function enrollTotp(friendlyName: string): Promise<Result<MfaEnrollment>> {
  const verified = await listMfaFactors();
  if (!verified.ok) return verified;
  if (verified.value.length >= MAX_TOTP_FACTORS) return err("identity.mfa_limit");
  const { data: all } = await supabase.auth.mfa.listFactors();
  for (const factor of all?.all ?? []) {
    if (factor.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: friendlyName.trim().slice(0, 40) || undefined,
  });
  if (error || !data) return err(mapMfaError(error));
  return ok({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
}

export const verifyTotpEnrollment = (factorId: string, code: string) => challengeAndVerify(factorId, code);

export async function cancelTotpEnrollment(factorId: string): Promise<Result<void>> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  return error ? err(mapMfaError(error)) : ok(undefined);
}

/** Removing a factor needs a fresh code from it, which lifts the session to AAL2 first. */
export async function removeTotpFactor(factorId: string, code: string): Promise<Result<void>> {
  const verified = await challengeAndVerify(factorId, code);
  if (!verified.ok) return verified;
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  return error ? err(mapMfaError(error)) : ok(undefined);
}

/**
 * Same checks as the web changePassword. The current password is verified on a throwaway
 * client so the phone's (possibly AAL2) session is kept.
 */
export async function changePassword(input: {
  currentPassword: string;
  newPassword: string;
  signOutOthers: boolean;
}): Promise<Result<void>> {
  if (!input.currentPassword) return err("identity.password_required");
  if (!meetsPasswordPolicy(input.newPassword)) return err("identity.password_weak");
  if (input.newPassword === input.currentPassword) return err("identity.password_same");

  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email;
  if (!email) return err("identity.reset_session_expired");
  const { error: passwordError } = await statelessSupabase.auth.signInWithPassword({
    email,
    password: input.currentPassword,
  });
  if (passwordError) {
    return err(passwordError.code === "invalid_credentials" ? "identity.current_password_wrong" : "platform.unexpected");
  }
  void statelessSupabase.auth.signOut({ scope: "local" });

  const { error } = await supabase.auth.updateUser({ password: input.newPassword });
  if (error) return err(mapUpdatePasswordAuthError(error));

  if (input.signOutOthers) {
    await supabase.auth.signOut({ scope: "others" });
    await revokeOtherSessions();
  }
  return ok(undefined);
}

export async function getEmailState(): Promise<{ email: string; pendingEmail: string | null }> {
  const { data } = await supabase.auth.getUser();
  return { email: data.user?.email ?? "", pendingEmail: data.user?.new_email ?? null };
}

/** Starts an email change; both addresses get a confirmation link. */
export async function changeEmail(currentEmail: string, email: string): Promise<Result<{ pendingEmail: string }>> {
  const trimmed = email.trim();
  if (!EMAIL.test(trimmed)) return err("identity.email_invalid");
  if (currentEmail && trimmed.toLowerCase() === currentEmail.toLowerCase()) return err("identity.email_same");
  const { data, error } = await supabase.auth.updateUser({ email: trimmed });
  if (error) {
    if (error.code === "email_exists") return err("identity.email_taken");
    if (error.code === "email_address_invalid") return err("identity.email_invalid");
    if (error.code === "email_address_not_authorized") return err("identity.email_not_authorized");
    return err("platform.unexpected");
  }
  return ok({ pendingEmail: data.user?.new_email ?? trimmed });
}
