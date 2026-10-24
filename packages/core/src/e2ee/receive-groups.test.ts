import { describe, expect, it } from "vitest";

import type { MailboxEnvelope } from "../mailbox/types";
import { createEncryptedEnvelopeHandler } from "./receive";
import {
  ENCRYPTED_ENVELOPE_KIND,
  GROUP_ENVELOPE_KIND,
  encodeGroupPayload,
  encodePlainEnvelope,
  type PlainEnvelope,
} from "./plain-envelope";

const C = "conv-1";
const olmBytes = new TextEncoder().encode(JSON.stringify({ t: 1, b: "x" }));

function env(over: Partial<MailboxEnvelope>): MailboxEnvelope {
  return {
    seq: 1,
    id: "e",
    senderDeviceId: "dev-a",
    senderUserId: "alice",
    conversationId: C,
    kind: ENCRYPTED_ENVELOPE_KIND,
    payload: olmBytes,
    createdAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

describe("group_state_key authorisation", () => {
  async function run(isAdmin: boolean | undefined) {
    const accepted: string[] = [];
    const rejected: string[] = [];
    const looked: string[][] = [];
    const key: PlainEnvelope = {
      v: 1,
      id: "k1",
      conversationId: C,
      sentAt: "2026-01-01T00:00:00Z",
      kind: "group_state_key",
      body: { key: "KEY", version: 1 },
    };
    const handler = createEncryptedEnvelopeHandler({
      sessions: { decryptFrom: async () => encodePlainEnvelope(key) } as never,
      store: {} as never,
      onStateKey: async (_c, k) => void accepted.push(k),
      ...(isAdmin === undefined
        ? {}
        : {
            isConversationAdmin: async (c: string, u: string) => {
              looked.push([c, u]);
              return isAdmin;
            },
          }),
      onRejected: (_e, r) => void rejected.push(r),
    });
    await handler(env({ id: "k1" }));
    return { accepted, rejected, looked };
  }

  it("accepts a key from an admin sender", async () => {
    const r = await run(true);
    expect(r.accepted).toEqual(["KEY"]);
    expect(r.looked).toEqual([[C, "alice"]]);
    expect(r.rejected).toEqual([]);
  });

  it("drops a key from a non-admin sender", async () => {
    const r = await run(false);
    expect(r.accepted).toEqual([]);
    expect(r.rejected).toEqual(["e2ee.not_admin"]);
  });

  it("fails closed without an admin lookup", async () => {
    const r = await run(undefined);
    expect(r.accepted).toEqual([]);
    expect(r.rejected).toEqual(["e2ee.not_admin"]);
  });
});

describe("group message before its sender_key", () => {
  it("queues the message and replays it once the key arrives", async () => {
    const delivered: string[] = [];
    const rejected: string[] = [];
    const known = new Set<string>();
    const text: PlainEnvelope = {
      v: 1,
      id: "m1",
      conversationId: C,
      sentAt: "2026-01-01T00:00:00Z",
      kind: "text",
      body: "early bird",
    };
    const sk: PlainEnvelope = {
      v: 1,
      id: "k1",
      conversationId: C,
      sentAt: "2026-01-01T00:00:00Z",
      kind: "sender_key",
      body: { sessionId: "S1", sessionKey: "SK" },
    };
    const rows: string[] = [];
    const handler = createEncryptedEnvelopeHandler({
      sessions: { decryptFrom: async () => encodePlainEnvelope(sk) } as never,
      groups: {
        decrypt: async (_d: string, _c: string, sid: string) => {
          if (!known.has(sid)) throw new Error("e2ee.no_group_key");
          return encodePlainEnvelope(text);
        },
        acceptSenderKey: async (_d: string, _c: string, sid: string) => {
          known.add(sid);
          return true;
        },
      } as never,
      store: {
        getMessage: async (id: string) => (rows.includes(id) ? {} : null),
        upsertMessages: async (m: { id: string }[]) =>
          void rows.push(...m.map((x) => x.id)),
        listKv: async () => [],
      } as never,
      onMessage: (row) => void delivered.push(row.body ?? ""),
      onRejected: (_e, r) => void rejected.push(r),
    });
    const early = env({
      id: "m1",
      kind: GROUP_ENVELOPE_KIND,
      payload: encodeGroupPayload({ sessionId: "S1", ciphertext: "ct" }),
    });
    await handler(early);
    expect(delivered).toEqual([]);
    expect(rejected).toEqual([]);

    await handler(env({ id: "k1" }));
    expect(delivered).toEqual(["early bird"]);
    expect(rejected).toEqual([]);
  });

  it("does not replay for a different session", async () => {
    const delivered: string[] = [];
    const known = new Set<string>();
    const handler = createEncryptedEnvelopeHandler({
      sessions: {
        decryptFrom: async () =>
          encodePlainEnvelope({
            v: 1,
            id: "k1",
            conversationId: C,
            sentAt: "2026-01-01T00:00:00Z",
            kind: "sender_key",
            body: { sessionId: "OTHER", sessionKey: "SK" },
          }),
      } as never,
      groups: {
        decrypt: async () => {
          throw new Error("e2ee.no_group_key");
        },
        acceptSenderKey: async (_d: string, _c: string, sid: string) => (
          known.add(sid),
          true
        ),
      } as never,
      store: {} as never,
      onMessage: (r) => void delivered.push(r.body ?? ""),
    });
    await handler(
      env({
        id: "m1",
        kind: GROUP_ENVELOPE_KIND,
        payload: encodeGroupPayload({ sessionId: "S1", ciphertext: "ct" }),
      }),
    );
    await handler(env({ id: "k1" }));
    expect(delivered).toEqual([]);
  });
});
