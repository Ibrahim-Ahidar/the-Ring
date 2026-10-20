import { cookies } from "next/headers";

import { pageLimitFromCookie, VIEWPORT_COOKIE } from "./lib/page-limit";

/** The page size for this request, from the viewport height the client reported. */
export async function readPageLimit(): Promise<number> {
  const store = await cookies();
  return pageLimitFromCookie(store.get(VIEWPORT_COOKIE)?.value);
}
