import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isHttpUrl } from "@/platform/env/validate";
import { loginPath, parseLoginReason, safeNextPath } from "@/platform/login-redirect";

function readMiddlewareEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!isHttpUrl(supabaseUrl) || !supabaseAnonKey?.trim()) {
    return null;
  }

  return { supabaseUrl, supabaseAnonKey };
}

/** Redirects while keeping any auth cookies Supabase refreshed on `carry`. */
function redirectTo(request: NextRequest, target: string, carry?: NextResponse) {
  const response = NextResponse.redirect(new URL(target, request.nextUrl.origin));
  carry?.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}

function loginWithNext(request: NextRequest): string {
  const { pathname, search } = request.nextUrl;
  return loginPath({ next: safeNextPath(`${pathname}${search}`, "/app") });
}

export async function updateSession(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const isAppPath = pathname === "/app" || pathname.startsWith("/app/");
  const isAuthPage = pathname === "/login" || pathname === "/signup";

  const env = readMiddlewareEnv();
  if (!env) {
    return isAppPath
      ? redirectTo(request, loginWithNext(request))
      : NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  // Verifies the JWT locally (cached JWKS) instead of a network call to the auth server;
  // the server-side session check in the app layout still validates revocation.
  const { data: claimsData } = await supabase.auth.getClaims();
  const user = claimsData?.claims?.sub ? claimsData.claims : null;

  if (!user) {
    return isAppPath
      ? redirectTo(request, loginWithNext(request), supabaseResponse)
      : supabaseResponse;
  }

  // A signed-in member has no use for the landing page; take them to their chats.
  if (pathname === "/") {
    return redirectTo(request, "/app", supabaseResponse);
  }

  if (isAuthPage) {
    const reason = parseLoginReason(searchParams.get("reason"));
    // Server components cannot clear auth cookies, so a revoked session ends here.
    if (reason === "identity.session_revoked") {
      await supabase.auth.signOut({ scope: "local" });
      return supabaseResponse;
    }
    // With a reason the app sent the member here on purpose; bouncing back would loop.
    if (!reason) {
      return redirectTo(
        request,
        safeNextPath(searchParams.get("next"), "/app"),
        supabaseResponse,
      );
    }
  }

  return supabaseResponse;
}
