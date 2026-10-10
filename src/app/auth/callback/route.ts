import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { readDeviceId, writeDeviceId } from "@/features/identity/device-cookie";
import { registerDevice } from "@/features/identity/service";
import { asRpcClient } from "@/platform/rpc";
import { tryCreateSupabaseServerClient } from "@/platform/supabase/safe-server";

/**
 * Link landing for email change and the password-reset fallback (`next=/reset-password`).
 * Signup and password reset normally confirm with a 6-digit code (issues #52, #51).
 * A failed exchange (expired or used link) sends a reset to /reset-password, which
 * shows "This link has expired" with a way to request a new code.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/login";
  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/login";
  // An expired reset link still lands on the reset page, which explains what happened.
  const failure = target === "/reset-password" ? "/reset-password" : "/login";

  if (!code) {
    return NextResponse.redirect(new URL(failure, url.origin));
  }

  const supabase = await tryCreateSupabaseServerClient();
  if (!supabase) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL(failure, url.origin));
  }

  // The link signs the member in, so it registers a device like password sign-in does.
  // A stale cookie from another account is replaced by a fresh id (issue #50).
  const device = await registerDevice(
    asRpcClient(supabase),
    await readDeviceId(),
    null,
    randomUUID,
  );
  if (!device.ok) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login", url.origin));
  }
  await writeDeviceId(device.value);

  return NextResponse.redirect(new URL(target, url.origin));
}
