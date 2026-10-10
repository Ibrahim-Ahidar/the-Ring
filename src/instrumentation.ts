import { validateEnv } from "@/platform/env/validate";

export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }

  const missing = validateEnv(process.env);
  if (missing.length > 0) {
    console.warn(
      `[Pulse] Supabase is disabled because environment configuration is missing or invalid: ${missing.join(
        ", ",
      )}`,
    );
  }
}
