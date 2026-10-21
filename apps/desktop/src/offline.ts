/** Chromium net error codes that mean "cannot reach the server". -3 (ERR_ABORTED) is excluded. */
const OFFLINE_ERRORS = new Set([
  -7, // ERR_TIMED_OUT
  -21, // ERR_NETWORK_CHANGED
  -101, // ERR_CONNECTION_RESET
  -102, // ERR_CONNECTION_REFUSED
  -105, // ERR_NAME_NOT_RESOLVED
  -106, // ERR_INTERNET_DISCONNECTED
  -109, // ERR_ADDRESS_UNREACHABLE
  -118, // ERR_CONNECTION_TIMED_OUT
]);

export function isOfflineError(errorCode: number): boolean {
  return OFFLINE_ERRORS.has(errorCode);
}

/** Delay before retry number `attempt` (0-based): 2s, 4s, 8s ... capped at 30s. */
export function nextRetryDelay(attempt: number): number {
  const a = Math.max(0, Math.floor(attempt));
  return Math.min(2000 * 2 ** a, 30000);
}
