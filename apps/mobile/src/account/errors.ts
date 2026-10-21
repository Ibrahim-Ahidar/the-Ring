/** Maps an `identity.*` / `platform.*` code to a `mobile.account.errors.*` key. */
export function accountErrorKey(code: string | undefined, has: (key: string) => boolean): string {
  const short = (code ?? "").replace(/^(identity|platform)\./, "");
  const key = `mobile.account.errors.${short}`;
  return short && has(key) ? key : "mobile.account.errors.unexpected";
}
