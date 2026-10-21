/** True when `url` is on the same origin as `base` (the Pulse origin). */
export function isPulseUrl(url: string, base: string): boolean {
  try {
    return new URL(url).origin === new URL(base).origin;
  } catch {
    return false;
  }
}
