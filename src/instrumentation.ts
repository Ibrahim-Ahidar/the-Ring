import { validateEnv } from "@/platform/env/validate";

export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") {
    return;
  }

  // The NEXT_RUNTIME literal check lets webpack drop this import from the edge bundle.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.PULSE_PERF_TRACE === "1") {
    const { startFetchTrace } = await import("@/platform/perf-trace");
    startFetchTrace();
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
