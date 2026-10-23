/** E2EE feature flag (spec D17). Off unless the env var is exactly "1". */
export function isE2eeEnabled(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.NEXT_PUBLIC_PULSE_E2EE === "1" || env?.EXPO_PUBLIC_PULSE_E2EE === "1";
}
