import { err, ok, type Result } from "@pulse/core";

import { deleteLocalDatabase } from "@/local/db";
import { mapAuthError } from "./auth-errors";
import { supabase } from "./client";
import { devices } from "./devices";
import { withDeviceLifecycle } from "./devices-core";

export interface AppSession {
  userId: string;
  email: string | null;
  /** AAL1 with a verified factor: the sign-in still owes a TOTP code. */
  mfaPending: boolean;
}

type RawSession = { user: { id: string; email?: string | null } } | null;

/** Same rule as the web needsSecondFactor; read from the stored session, no request. */
async function mfaPending(): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return false;
  return data.nextLevel === "aal2" && data.currentLevel !== "aal2";
}

async function toAppSession(session: RawSession): Promise<AppSession | null> {
  if (!session) return null;
  return { userId: session.user.id, email: session.user.email ?? null, mfaPending: await mfaPending() };
}

export async function getSession(): Promise<AppSession | null> {
  const { data } = await supabase.auth.getSession();
  return toAppSession(data.session);
}

/** Calls `handler` on every sign-in, sign-out, refresh and MFA step-up. Returns an unsubscribe. */
export function onSessionChange(handler: (session: AppSession | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    // Deferred: awaiting auth calls inside this callback deadlocks supabase-js.
    setTimeout(() => {
      void toAppSession(session)
        .then(handler)
        .catch(() => handler(null));
    }, 0);
  });
  return () => data.subscription.unsubscribe();
}

async function rawSignInWithPassword(email: string, password: string): Promise<Result<AppSession>> {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return err(mapAuthError(error));
    const session = await toAppSession(data.session);
    return session ? ok(session) : err("mobile.login.errors.unexpected");
  } catch (e) {
    return err(mapAuthError(e instanceof Error ? e : { message: String(e) }));
  }
}

async function rawSignOut(): Promise<Result<null>> {
  // scope "local" ends only this device's session and always clears local storage.
  const { error } = await supabase.auth.signOut({ scope: "local" });
  await deleteLocalDatabase(); // no-op unless the e2ee flag opened a local database
  return error ? err("mobile.logout.error") : ok(null);
}

const actions = withDeviceLifecycle<AppSession>({ signIn: rawSignInWithPassword, signOut: rawSignOut, devices });

/** Signs in, then registers this phone for push without blocking login. */
export const signInWithPassword = actions.signIn;

/** Removes this phone Device, then signs out. */
export const signOut = actions.signOut;
