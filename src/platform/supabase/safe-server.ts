import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { validateEnv } from "@/platform/env/validate";

/**
 * Creates a Supabase server client when env is configured; otherwise null (anonymous).
 */
export async function tryCreateSupabaseServerClient() {
  const missing = validateEnv(process.env);
  if (missing.length > 0) {
    return null;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Component cookie writes may be read-only.
        }
      },
    },
  });
}

/**
 * Cookie-less anon client for auth calls that must not touch the session, such as
 * `signUp` and `resend`. The cookie-backed client writes a PKCE code-verifier cookie on
 * every signUp; that makes Next re-render the page after the server action and remount
 * the signup form, discarding its state (no error, no code-entry step).
 */
export function tryCreateStatelessSupabaseClient() {
  const missing = validateEnv(process.env);
  if (missing.length > 0) {
    return null;
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
}
