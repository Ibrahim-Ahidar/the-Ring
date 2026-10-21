const PUBLIC_ENV_KEYS = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

function readPublicEnv() {
  return {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

/** Public env values safe to use in browser bundles. Call sites should run after boot validation. */
export function getPublicEnv() {
  const env = readPublicEnv();
  const missing = PUBLIC_ENV_KEYS.filter((key) => {
    const value = env[key];
    return value === undefined || value.trim() === "";
  });
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}`,
    );
  }
  return {
    appUrl: env.NEXT_PUBLIC_APP_URL!,
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseAnonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  };
}
