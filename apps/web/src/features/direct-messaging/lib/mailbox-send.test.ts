import { describe, expect, it } from "vitest";

import type { RpcClient } from "@pulse/core/rpc";

import { createMailboxTextSender, decodeTextEnvelope, derivedId } from "./mailbox-send";

const ME = "00000000-0000-4000-8000-000000000001";
const D_ME1 = "10000000-0000-4000-8000-000000000001";
const D_ME2 = "10000000-0000-4000-8000-000000000002";
const D_PEER = "10000000-0000-4000-8000-000000000003";
const CONV = "20000000-0000-4000-8000-000000000001";
const CID = "30000000-0000-4000-8000-000000000001";

function fakeClient(statuses: string[] = []) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client: RpcClient = {
    async rpc(fn, args = {}) {
      calls.push({ fn, args });
      if (fn === "mailbox_recipients") {
        return {
          data: [
            { user_id: ME, device_id: D_ME1, is_current_session: true },
            { user_id: ME, device_id: D_ME2, is_current_session: false },
            { user_id: "peer", device_id: D_PEER, is_current_session: false },
          ],
          error: null,
        };
      }
      const batch = args.p_batch as { id: string }[];
      return {
        data: batch.map((b, i) => ({ id: b.id, status: statuses[i] ?? "sent" })),
        error: null,
      };
    },
  };
  return { client, calls };
}

describe("mailbox text sender", () => {
  it("sends one plaintext envelope to each other device, never to the sending device", async () => {
    const { client, calls } = fakeClient();
    const send = createMailboxTextSender({ client, userId: ME });
    const res = await send({ conversationId: CONV, clientId: CID, body: "hi" });
    expect(res.ok).toBe(true);
    const batch = calls.find((c) => c.fn === "send_envelopes")!.args.p_batch as {
      recipient_device_id: string;
      sender_device_id: string;
      ciphertext: string;
      id: string;
    }[];
    expect(batch.map((b) => b.recipient_device_id).sort()).toEqual([D_ME2, D_PEER].sort());
    expect(batch.every((b) => b.sender_device_id === D_ME1)).toBe(true);
    const bytes = Uint8Array.from(atob(batch[0]!.ciphertext), (c) => c.charCodeAt(0));
    expect(decodeTextEnvelope(bytes)).toMatchObject({ body: "hi", client_id: CID });
  });

  it("uses the same mailbox ids on a resend so the server dedups", async () => {
    const a = fakeClient();
    const b = fakeClient();
    await createMailboxTextSender({ client: a.client, userId: ME })({
      conversationId: CONV,
      clientId: CID,
      body: "hi",
    });
    await createMailboxTextSender({ client: b.client, userId: ME })({
      conversationId: CONV,
      clientId: CID,
      body: "hi",
    });
    const ids = (c: typeof a) =>
      (c.calls.find((x) => x.fn === "send_envelopes")!.args.p_batch as { id: string }[]).map(
        (e) => e.id,
      );
    expect(ids(a)).toEqual(ids(b));
    expect(new Set(ids(a)).size).toBe(2);
    expect(derivedId(CID, D_PEER)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("fails when every envelope is forbidden", async () => {
    const { client } = fakeClient(["forbidden", "forbidden"]);
    const res = await createMailboxTextSender({ client, userId: ME })({
      conversationId: CONV,
      clientId: CID,
      body: "hi",
    });
    expect(res).toEqual({ ok: false, error: { code: "messaging.forbidden" } });
  });
});
