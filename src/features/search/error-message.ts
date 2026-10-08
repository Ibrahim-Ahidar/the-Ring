export function searchErrorKey(code: string): string {
  return `errors.${code}` as const;
}
