import { validateEnv } from "@/platform/env/validate";

export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }

  const missing = validateEnv(process.env);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}`,
    );
  }
}
