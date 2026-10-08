import { z } from "zod";

export const REQUIRED_ENV_KEYS = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

export type RequiredEnvKey = (typeof REQUIRED_ENV_KEYS)[number];

const fieldSchemas: Record<RequiredEnvKey, z.ZodString> = {
  NEXT_PUBLIC_APP_URL: z.string().trim().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.string().trim().min(1),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().trim().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().trim().min(1),
};

/**
 * Returns the names of required environment variables that are missing or empty.
 */
export function validateEnv(
  source: Record<string, string | undefined>,
): RequiredEnvKey[] {
  const missing: RequiredEnvKey[] = [];

  for (const key of REQUIRED_ENV_KEYS) {
    const parsed = fieldSchemas[key].safeParse(source[key] ?? "");
    if (!parsed.success) {
      missing.push(key);
    }
  }

  return missing;
}
