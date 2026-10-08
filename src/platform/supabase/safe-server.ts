import "server-only";

import { createServerClient } from "@supabase/ssr";
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
