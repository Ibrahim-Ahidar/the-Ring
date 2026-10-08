import "server-only";

import { validateEnv } from "./validate";

export function getServerEnv() {
  const source = {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  const missing = validateEnv(source);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}`,
    );
  }

  return {
    appUrl: source.NEXT_PUBLIC_APP_URL!,
    supabaseUrl: source.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseAnonKey: source.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    supabaseServiceRoleKey: source.SUPABASE_SERVICE_ROLE_KEY!,
  };
}
