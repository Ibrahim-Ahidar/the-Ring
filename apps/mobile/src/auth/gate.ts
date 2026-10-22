export interface GateInput {
  loading: boolean;
  signedIn: boolean;
  /** Signed in at AAL1 with a verified factor: the second step is still owed. */
  mfaPending?: boolean;
  /** First route segment, e.g. "(auth)", "(app)" or "legal"; undefined at the root. */
  group: string | undefined;
  /** Second route segment, e.g. "verify" inside "(auth)". */
  screen?: string;
}

/** Returns where to redirect, or null to stay. */
export function decideRedirect({ loading, signedIn, mfaPending, group, screen }: GateInput): "/login" | "/" | "/verify" | null {
  if (loading) return null;
  // Terms and privacy are public, like the web /legal pages.
  if (group === "legal") return null;
  const inAuth = group === "(auth)";
  const onVerify = inAuth && screen === "verify";
  if (!signedIn) return inAuth && !onVerify ? null : "/login";
  if (mfaPending) return onVerify ? null : "/verify";
  if (inAuth) return "/";
  return null;
}
