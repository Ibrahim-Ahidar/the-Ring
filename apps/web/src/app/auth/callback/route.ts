import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { readDeviceId, writeDeviceId } from "@/features/identity/device-cookie";
import { deviceLabelFromUserAgent } from "@/features/identity/device-label";
import { registerDevice } from "@/features/identity/service";
import { loginPath, safeNextPath, type LoginReason } from "@/platform/login-redirect";
import { asRpcClient } from "@/platform/rpc";
import { tryCreateSupabaseServerClient } from "@/platform/supabase/safe-server";

const EXPIRED_CODES = new Set(["otp_expired", "flow_state_expired"]);

function linkFailure(errorCode: string | null | undefined): LoginReason {
  return errorCode && EXPIRED_CODES.has(errorCode) ? "link_expired" : "link_invalid";
}

/**
 * Link landing for email change and the password-reset fallback (`next=/reset-password`).
 * Signup and password reset normally confirm with a 6-digit code (issues #52, #51).
 * A failed reset link lands on /reset-password, which explains the expiry itself;
 * any other failed link lands on /login with `link_expired` or `link_invalid`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const target = safeNextPath(url.searchParams.get("next"), "/app");
  const fail = (reason: LoginReason) =>
    NextResponse.redirect(
      new URL(target === "/reset-password" ? target : loginPath({ reason }), url.origin),
    );

  if (!code) {
    // The first of two email-change links carries only `?message=` (the other address
    // still has to confirm); the target page shows the pending change.
    if (url.searchParams.get("message") && !url.searchParams.get("error_code")) {
      return NextResponse.redirect(new URL(target, url.origin));
    }
    // GoTrue reports a rejected link as `?error_code=otp_expired` instead of a code.
    return fail(linkFailure(url.searchParams.get("error_code")));
  }

  const supabase = await tryCreateSupabaseServerClient();
  if (!supabase) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return fail(linkFailure(error.code));
  }

  // The link signs the member in, so it registers a device like password sign-in does.
  // A stale cookie from another account is replaced by a fresh id (issue #50).
  const device = await registerDevice(
    asRpcClient(supabase),
    await readDeviceId(),
    deviceLabelFromUserAgent(request.headers.get("user-agent")),
    randomUUID,
  );
  if (!device.ok) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL(loginPath({ reason: "signed_out" }), url.origin));
  }
  await writeDeviceId(device.value);

  return NextResponse.redirect(new URL(target, url.origin));
}
