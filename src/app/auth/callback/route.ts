import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { readDeviceId, writeDeviceId } from "@/features/identity/device-cookie";
import { asRpcClient, callRpc } from "@/platform/rpc";
import { tryCreateSupabaseServerClient } from "@/platform/supabase/safe-server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/login";

  if (!code) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  const supabase = await tryCreateSupabaseServerClient();
  if (!supabase) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/login", url.origin));
  }

  // The link signs the member in, so it registers a device like password sign-in does.
  const deviceId = (await readDeviceId()) ?? randomUUID();
  const device = await callRpc<string>(asRpcClient(supabase), "identity_upsert_device", {
    p_device_id: deviceId,
    p_device_label: null,
  });
  if (!device.ok) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login", url.origin));
  }
  await writeDeviceId(deviceId);

  const target = next.startsWith("/") && !next.startsWith("//") ? next : "/login";
  return NextResponse.redirect(new URL(target, url.origin));
}
