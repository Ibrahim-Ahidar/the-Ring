// Edge Function media-upload-url (issue #230). Logic lives in handler.ts.
// Secrets (supabase secrets set): R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.
// SUPABASE_URL and SUPABASE_ANON_KEY are provided by the platform.
// Deploy: supabase functions deploy media-upload-url
import { createClient } from "npm:@supabase/supabase-js@2";
import { handle, type Deps } from "./handler.ts";

function r2FromEnv(): Deps["r2"] {
  const accountId = Deno.env.get("R2_ACCOUNT_ID");
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  const bucket = Deno.env.get("R2_BUCKET");
  return accountId && accessKeyId && secretAccessKey && bucket
    ? { accountId, accessKeyId, secretAccessKey, bucket }
    : null;
}

const userClient = (authorization: string) =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });

Deno.serve((req: Request) =>
  handle(req, {
    r2: r2FromEnv(),
    now: () => new Date(),
    newId: () => crypto.randomUUID(),
    async authenticate(authorization) {
      const { data, error } = await userClient(authorization).auth.getUser(authorization.slice(7));
      return error || !data.user ? null : { userId: data.user.id };
    },
    // mailbox_recipients raises messaging.not_a_member for anyone who is not an active member.
    async isMember(authorization, conversationId) {
      const { error } = await userClient(authorization).rpc("mailbox_recipients", {
        p_conversation_id: conversationId,
      });
      return !error;
    },
  }),
);
