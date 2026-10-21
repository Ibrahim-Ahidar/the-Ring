import { err, ok, parseMobileCompat, type MobileCompat, type Result } from "@pulse/core";

import { rpc } from "./rpc";

/** Backend minimum supported build, readable before sign-in. */
export async function getMobileCompat(): Promise<Result<MobileCompat>> {
  const result = await rpc<unknown>("get_mobile_compat");
  return result.ok ? ok(parseMobileCompat(result.value)) : err(result.error.code);
}
