export interface AuthErrorLike {
  code?: string;
  message: string;
  status?: number;
  name?: string;
}

/** Maps a Supabase auth error to a `mobile.login.errors.*` catalog key. */
export function mapAuthError(error: AuthErrorLike): string {
  switch (error.code) {
    case "invalid_credentials":
      return "mobile.login.errors.invalidCredentials";
    case "email_not_confirmed":
      return "mobile.login.errors.emailNotConfirmed";
    case "over_request_rate_limit":
      return "mobile.login.errors.rateLimited";
  }
  if (error.status === 429) return "mobile.login.errors.rateLimited";
  if (error.name === "AuthRetryableFetchError" || /network request failed/i.test(error.message)) {
    return "mobile.login.errors.network";
  }
  return "mobile.login.errors.unexpected";
}
