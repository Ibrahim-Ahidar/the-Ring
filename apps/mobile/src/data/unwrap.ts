/** Returns the value of a successful Result, or throws an Error carrying the error code (for react-query). */
export function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: { code: string } }): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}
