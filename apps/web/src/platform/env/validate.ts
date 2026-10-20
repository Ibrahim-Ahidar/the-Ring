import { z } from "zod";

export const REQUIRED_ENV_KEYS = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export type RequiredEnvKey = (typeof REQUIRED_ENV_KEYS)[number];

const URL_ENV_KEYS = new Set<RequiredEnvKey>([
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
]);

const fieldSchemas: Record<RequiredEnvKey, z.ZodString> = {
  NEXT_PUBLIC_APP_URL: z.string().trim().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.string().trim().min(1),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().trim().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1),
};

/** True when a value can be safely passed to HTTP clients such as Supabase. */
export function isHttpUrl(value: string | undefined): value is string {
  if (!value?.trim()) {
    return false;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Returns the names of required environment variables that are missing, empty,
 * or malformed.
 */
export function validateEnv(
  source: Record<string, string | undefined>,
): RequiredEnvKey[] {
  const missing: RequiredEnvKey[] = [];

  for (const key of REQUIRED_ENV_KEYS) {
    const value = source[key];
    const parsed = fieldSchemas[key].safeParse(value ?? "");
    if (!parsed.success || (URL_ENV_KEYS.has(key) && !isHttpUrl(value))) {
      missing.push(key);
    }
  }

  return missing;
}
