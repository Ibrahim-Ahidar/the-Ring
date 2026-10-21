// Edge Function push-notify (issue #183, spec section 7).
// Called by a DB trigger (migration push_notify_webhook) on INSERT into
// public.notifications. Sends one Expo push per registered device.
//
// Secrets (supabase secrets set): PUSH_WEBHOOK_SECRET.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  buildMessages,
  deadTokens,
  previewBody,
  shouldPush,
  type ExpoTicket,
  type NotificationRow,
} from "./recipients.ts";

const EXPO_URL = "https://exp.host/--/api/v2/push/send";

/** Constant-time string compare (length is not secret). */
function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const secret = Deno.env.get("PUSH_WEBHOOK_SECRET");
  if (!secret || !safeEqual(req.headers.get("x-webhook-secret") ?? "", secret)) {
    return new Response("unauthorized", { status: 401 });
  }

  let payload: { type?: string; record?: NotificationRow };
  try {
    payload = (await req.json()) as { type?: string; record?: NotificationRow };
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const n = payload.record;
  if (payload.type !== "INSERT" || !n || !n.conversation_id) {
    return Response.json({ skipped: "not a conversation notification" });
  }

  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const [member, prefs, actor, message, devices] = await Promise.all([
    db.from("conversation_members").select("muted_until, left_at")
      .eq("conversation_id", n.conversation_id).eq("user_id", n.recipient_id).maybeSingle(),
    db.from("notification_preferences").select("mentions_only")
      .eq("user_id", n.recipient_id).maybeSingle(),
    n.actor_id
      ? db.from("profiles").select("display_name").eq("id", n.actor_id).maybeSingle()
      : Promise.resolve({ data: null }),
    n.entity_id
      ? db.from("messages").select("type, body").eq("id", n.entity_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from("devices").select("push_token").eq("user_id", n.recipient_id)
      .not("push_token", "is", null).is("revoked_at", null),
  ]);

  for (const [name, r] of [["member", member], ["prefs", prefs], ["devices", devices]] as const) {
    if (r.error) {
      console.error(`push-notify: ${name} query failed`, r.error.message);
      return new Response("query failed", { status: 500 });
    }
  }

  const ok = shouldPush(n, {
    mutedUntil: member.data?.muted_until ?? null,
    mentionsOnly: prefs.data?.mentions_only ?? false,
    // notify() is called with p_mention=false for plain messages, so a
    // message.created row is never a mention here.
    isMention: false,
    isMember: !!member.data && member.data.left_at === null,
  });
  const tokens = ((devices.data ?? []) as { push_token: string }[]).map((d) => d.push_token);
  if (!ok || tokens.length === 0) return Response.json({ sent: 0 });

  const messages = buildMessages(
    tokens,
    actor.data?.display_name ?? "New message",
    previewBody(message.data?.type ?? null, message.data?.body ?? null),
    n.conversation_id,
    n.id,
  );

  const res = await fetch(EXPO_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(messages),
  });
  if (!res.ok) return new Response("expo error", { status: 502 });
  const { data: tickets } = (await res.json()) as { data: ExpoTicket[] };

  const dead = deadTokens(tokens, tickets ?? []);
  if (dead.length > 0) await db.from("devices").delete().in("push_token", dead);

  return Response.json({ sent: tokens.length, removed: dead.length });
});
