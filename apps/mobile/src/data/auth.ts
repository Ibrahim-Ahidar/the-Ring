import { err, ok, type Result } from "@pulse/core";

import { mapAuthError } from "./auth-errors";
import { supabase } from "./client";

export interface AppSession {
  userId: string;
  email: string | null;
}

type RawSession = { user: { id: string; email?: string | null } } | null;

function toAppSession(session: RawSession): AppSession | null {
  return session ? { userId: session.user.id, email: session.user.email ?? null } : null;
}

export async function getSession(): Promise<AppSession | null> {
  const { data } = await supabase.auth.getSession();
  return toAppSession(data.session);
}

/** Calls `handler` on every sign-in, sign-out and refresh. Returns an unsubscribe. */
export function onSessionChange(handler: (session: AppSession | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    handler(toAppSession(session));
  });
  return () => data.subscription.unsubscribe();
}

export async function signInWithPassword(email: string, password: string): Promise<Result<AppSession>> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return err(mapAuthError(error));
    const session = toAppSession(data.session);
    return session ? ok(session) : err("mobile.login.errors.unexpected");
  } catch (e) {
    return err(mapAuthError(e instanceof Error ? e : { message: String(e) }));
  }
}

export async function signOut(): Promise<Result<null>> {
  // scope "local" ends only this device's session and always clears local storage.
  const { error } = await supabase.auth.signOut({ scope: "local" });
  return error ? err("mobile.logout.error") : ok(null);
}
