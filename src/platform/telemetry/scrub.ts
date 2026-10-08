/** Property keys that must never be forwarded to the telemetry sink. */
export const FORBIDDEN_PROPERTY_KEYS = [
  "body",
  "text",
  "bio",
  "details",
] as const;

export type ForbiddenPropertyKey = (typeof FORBIDDEN_PROPERTY_KEYS)[number];

const FORBIDDEN_SET = new Set<string>(FORBIDDEN_PROPERTY_KEYS);

export function isForbiddenPropertyKey(key: string): boolean {
  return FORBIDDEN_SET.has(key);
}

export type SafeErrorPayload = {
  name: string;
  cause?: SafeErrorPayload;
};

/**
 * Strips content-bearing keys from plain objects (including nested objects and arrays).
 */
export function scrubProperties(
  input: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!input) {
    return {};
  }
  return scrubRecord(input);
}

function scrubRecord(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (isForbiddenPropertyKey(key)) {
      continue;
    }
    out[key] = scrubUnknown(value);
  }
  return out;
}

function scrubUnknown(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubUnknown(item));
  }
  if (value instanceof Error) {
    return toSafeErrorPayload(value);
  }
  if (typeof value === "object") {
    return scrubRecord(value as Record<string, unknown>);
  }
  return value;
}

/**
 * Builds a sink-safe error payload: message text is never included; causes are scrubbed recursively.
 */
export function toSafeErrorPayload(error: unknown): SafeErrorPayload {
  if (error instanceof Error) {
    const payload: SafeErrorPayload = { name: error.name };
    if (error.cause !== undefined) {
      payload.cause = toSafeErrorPayload(error.cause);
    }
    return payload;
  }
  return { name: "NonErrorThrown" };
}
