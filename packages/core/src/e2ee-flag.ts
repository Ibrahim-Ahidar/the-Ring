/** Feature flag for the local-first / E2EE work (spec D17). Off unless the env var is "1". */
export function isE2eeEnabled(
  env: Record<string, string | undefined> = readEnv(),
): boolean {
  return env.NEXT_PUBLIC_PULSE_E2EE === "1" || env.EXPO_PUBLIC_PULSE_E2EE === "1";
}

function readEnv(): Record<string, string | undefined> {
  // Literal property access so bundlers can inline NEXT_PUBLIC_ / EXPO_PUBLIC_ values.
  return {
    NEXT_PUBLIC_PULSE_E2EE:
      typeof process !== "undefined" ? process.env.NEXT_PUBLIC_PULSE_E2EE : undefined,
    EXPO_PUBLIC_PULSE_E2EE:
      typeof process !== "undefined" ? process.env.EXPO_PUBLIC_PULSE_E2EE : undefined,
  };
}
