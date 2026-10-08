export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string } };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err(code: string): Result<never> {
  return { ok: false, error: { code } };
}
