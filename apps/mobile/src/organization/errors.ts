/** Maps an RPC error code such as `organization.invalid_name` to a `mobile.organization.errors.*` key. */
export function organizationErrorKey(code: string | undefined, has: (key: string) => boolean): string {
  const short = (code ?? "").replace(/^organization\./, "");
  const key = `mobile.organization.errors.${short}`;
  return short && has(key) ? key : "mobile.organization.error";
}
