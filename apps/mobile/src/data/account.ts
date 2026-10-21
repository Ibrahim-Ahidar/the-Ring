import {
  callRpc,
  err,
  isOtpCode,
  mapOtpError,
  mapSignUpAuthError,
  mapUpdatePasswordAuthError,
  meetsPasswordPolicy,
  ok,
  validateUsername,
  type Result,
} from "@pulse/core";

import { supabase } from "./client";
import { devices } from "./devices";
import { rpcClient } from "./rpc";

export async function checkUsernameAvailable(username: string): Promise<Result<boolean>> {
  const valid = validateUsername(username);
  if (!valid.ok) return valid;
  return callRpc<boolean>(rpcClient, "identity_is_username_available", { p_username: username });
}

/** Creates the account; the 6-digit code arrives by email. */
export async function signUpWithPassword(input: {
  email: string;
  password: string;
  username: string;
}): Promise<Result<null>> {
  const valid = validateUsername(input.username);
  if (!valid.ok) return valid;
  if (!meetsPasswordPolicy(input.password)) return err("identity.password_weak");
  const email = input.email.trim();
  if (!email) return err("identity.email_required");

  const available = await checkUsernameAvailable(input.username);
  // A failed check must not block sign-up; the database rejects duplicates anyway.
  if (available.ok && !available.value) return err("identity.username_taken");

  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: { data: { username: valid.value.display, display_name: valid.value.display } },
  });
  if (error) return err(error.message.includes("identity.") ? error.message : mapSignUpAuthError(error));
  // An already-confirmed email returns an obfuscated user with no identities.
  if (data.user && data.user.identities?.length === 0) return err("identity.email_registered");
  return ok(null);
}

/** Confirms the signup code. On success the session starts and the auth gate opens the app. */
export async function verifySignupCode(email: string, token: string): Promise<Result<null>> {
  if (!isOtpCode(token)) return err("identity.code_invalid");
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: "signup" });
  if (error) return err(mapOtpError(error));
  void devices.register();
  return ok(null);
}

export async function resendSignupCode(email: string): Promise<Result<null>> {
  if (!email.trim()) return err("identity.email_required");
  const { error } = await supabase.auth.resend({ type: "signup", email: email.trim() });
  return error ? err(mapOtpError(error)) : ok(null);
}

/** Sends the recovery code. Unknown emails succeed silently. */
export async function requestPasswordReset(email: string): Promise<Result<null>> {
  if (!email.trim()) return err("identity.email_required");
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  return error ? err(mapOtpError(error)) : ok(null);
}

/** Verifies the recovery code and sets the new password in one step. */
export async function resetPasswordWithCode(input: {
  email: string;
  token: string;
  password: string;
}): Promise<Result<null>> {
  if (!isOtpCode(input.token)) return err("identity.code_invalid");
  if (!meetsPasswordPolicy(input.password)) return err("identity.password_weak");
  const verified = await supabase.auth.verifyOtp({
    email: input.email.trim(),
    token: input.token.trim(),
    type: "recovery",
  });
  if (verified.error) return err(mapOtpError(verified.error));
  const { error } = await supabase.auth.updateUser({ password: input.password });
  if (error) return err(mapUpdatePasswordAuthError(error));
  void devices.register();
  return ok(null);
}
