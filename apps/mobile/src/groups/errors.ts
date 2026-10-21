/** Maps an RPC error code such as `groups.name_required` to a `mobile.groups.errors.*` key. */
export function groupErrorKey(code: string | undefined, has: (key: string) => boolean): string {
  const short = (code ?? "").replace(/^groups\./, "");
  const key = `mobile.groups.errors.${short}`;
  return short && has(key) ? key : "mobile.groups.error";
}
