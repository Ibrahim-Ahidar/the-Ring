import { describe, expect, it } from "vitest";

import { createUser, hasSupabaseEnv } from "../harness/supabase";

describe.skipIf(!hasSupabaseEnv())("foundation schema (Supabase)", () => {
  it("non-member cannot read messages; member can", async () => {
    const member = await createUser({ username: "sup_mem_a" });
    const outsider = await createUser({ username: "sup_out_a" });
    const admin = (
      await import("../harness/supabase")
    ).adminClient();

    const conversationId = crypto.randomUUID();
    const messageId = crypto.randomUUID();
    const clientMsgId = crypto.randomUUID();

    const { error: convErr } = await admin.from("conversations").insert({
      id: conversationId,
      type: "direct",
    });
    expect(convErr).toBeNull();

    await admin.from("conversation_members").insert({
      conversation_id: conversationId,
      user_id: member.id,
      role: "member",
    });

    await admin.from("messages").insert({
      id: messageId,
      conversation_id: conversationId,
      sender_id: member.id,
      client_id: clientMsgId,
      type: "text",
      body: "hello supabase",
    });

    const outsiderRead = await outsider.client
      .from("messages")
      .select("id")
      .eq("conversation_id", conversationId);
    expect(outsiderRead.data ?? []).toHaveLength(0);

    const memberRead = await member.client
      .from("messages")
      .select("id, body")
      .eq("conversation_id", conversationId);
    expect(memberRead.data).toHaveLength(1);
    expect(memberRead.data?.[0]?.body).toBe("hello supabase");
  });

  it("block visible to blocker only", async () => {
    const blocker = await createUser({ username: "sup_blk_a" });
    const blocked = await createUser({ username: "sup_blk_b" });
    const admin = (
      await import("../harness/supabase")
    ).adminClient();

    await admin.from("blocks").insert({
      blocker_id: blocker.id,
      blocked_id: blocked.id,
    });

    const blockerView = await blocker.client.from("blocks").select("blocked_id");
    expect(blockerView.data).toHaveLength(1);

    const blockedView = await blocked.client.from("blocks").select("blocker_id");
    expect(blockedView.data ?? []).toHaveLength(0);
  });
});
