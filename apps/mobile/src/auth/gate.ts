export interface GateInput {
  loading: boolean;
  signedIn: boolean;
  /** First route segment, e.g. "(auth)" or "(app)"; undefined at the root. */
  group: string | undefined;
}

/** Returns where to redirect, or null to stay. */
export function decideRedirect({ loading, signedIn, group }: GateInput): "/login" | "/" | null {
  if (loading) return null;
  const inAuth = group === "(auth)";
  if (!signedIn && !inAuth) return "/login";
  if (signedIn && inAuth) return "/";
  return null;
}
