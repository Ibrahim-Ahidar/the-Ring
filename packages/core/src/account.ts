/** Matches `auth.minimum_password_length` and `password_requirements = "letters_digits"` in supabase/config.toml. */
export const MIN_PASSWORD_LENGTH = 8;

/** GoTrue's `letters_digits` rule only counts ASCII letters and digits, so this does too. */
export function meetsPasswordPolicy(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH && /[A-Za-z]/.test(password) && /[0-9]/.test(password);
}

/** True for the 6-digit code sent by signup and recovery emails. */
export function isOtpCode(token: string): boolean {
  return /^\d{6}$/.test(token.trim());
}

export interface AuthFailureLike {
  code?: string;
  status?: number;
}

const RATE_LIMIT_CODES = new Set(["over_request_rate_limit", "over_email_send_rate_limit"]);

function commonAuthError(error: AuthFailureLike): string {
  if (error.status === 429 || (error.code && RATE_LIMIT_CODES.has(error.code))) {
    return "platform.rate_limited";
  }
  return "platform.unexpected";
}

/** GoTrue answers `otp_expired` for both wrong and expired codes. */
export function mapOtpError(error: AuthFailureLike): string {
  if (error.code === "otp_expired") return "identity.code_expired";
  if (error.code === "invalid_otp" || error.code === "validation_failed") return "identity.code_invalid";
  return commonAuthError(error);
}

export function mapSignUpAuthError(error: AuthFailureLike): string {
  switch (error.code) {
    case "weak_password":
      return "identity.password_weak";
    case "email_address_invalid":
    case "validation_failed":
      return "identity.email_invalid";
    case "email_address_not_authorized":
      return "identity.email_undeliverable";
    case "user_already_exists":
    case "email_exists":
      return "identity.email_registered";
    default:
      return commonAuthError(error);
  }
}

export function mapUpdatePasswordAuthError(error: AuthFailureLike): string {
  if (error.code === "weak_password") return "identity.password_weak";
  if (error.code === "same_password") return "identity.password_same";
  if (error.code === "reauthentication_needed") return "identity.reauthentication_needed";
  if (error.code === "session_not_found" || error.status === 401) return "identity.reset_session_expired";
  return commonAuthError(error);
}
