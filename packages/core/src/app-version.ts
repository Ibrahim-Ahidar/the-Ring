/** Compares dotted numeric versions ("1.2.10"). Missing parts count as 0; junk parts as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((p) => Number.parseInt(p, 10) || 0);
  const pb = b.split(".").map((p) => Number.parseInt(p, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** True when the running build is older than the backend minimum. No minimum means allowed. */
export function isBelowMinimum(current: string, minimum: string | null | undefined): boolean {
  if (!minimum?.trim()) return false;
  return compareVersions(current, minimum) < 0;
}

export interface MobileCompat {
  minVersion: string | null;
  downloadUrl: string | null;
}

export function parseMobileCompat(raw: unknown): MobileCompat {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : null);
  return { minVersion: str(v.min_version), downloadUrl: str(v.download_url) };
}
