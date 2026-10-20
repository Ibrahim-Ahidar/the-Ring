import { type NextRequest } from "next/server";

import { updateSession } from "@/platform/supabase/middleware";

export async function middleware(request: NextRequest) {
  if (process.env.PULSE_PERF_TRACE !== "1") {
    return updateSession(request);
  }
  const startedAt = Date.now();
  const response = await updateSession(request);
  const rsc = request.headers.get("rsc") === "1" ? " rsc" : "";
  console.log(
    `[perf] t=${startedAt} dur=${Date.now() - startedAt}ms middleware ${request.nextUrl.pathname}${rsc}`,
  );
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
