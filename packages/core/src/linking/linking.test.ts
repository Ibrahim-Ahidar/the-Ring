import { ed25519 } from "@noble/curves/ed25519";
import { describe, expect, it } from "vitest";

import { createSqlLocalStore, type LocalStore } from "../local-store";
import { createNodeSqliteExecutor } from "../local-store/node-sqlite-executor";
import type { MessageRow } from "../local-store/types";
import { toB64 } from "./bytes";
import {
  createEphemeralKey,
  createLinkChannel,
  type LinkFrame,
  type LinkTransport,
  parseLinkFrame,
} from "./channel";
import { LinkError } from "./errors";
import type { ArchiveStorage } from "./history";
import { encodeLinkQr, linkTopic, parseLinkQr } from "./qr";
import {
  accountPublicKey,
  runExistingDeviceLink,
  startNewDeviceLink,
} from "./session";

function pair() {
  const log: LinkFrame[] = [];
  const subs: { a: ((f: LinkFrame) => void)[]; b: ((f: LinkFrame) => void)[] } =
    { a: [], b: [] };
  const mk = (me: "a" | "b"): LinkTransport => ({
    send(f) {
      log.push(f);
      const other = me === "a" ? subs.b : subs.a;
      queueMicrotask(() => other.forEach((l) => l(f)));
    },
    subscribe(l) {
      subs[me].push(l);
      return () => {
        subs[me] = subs[me].filter((x) => x !== l);
      };
    },
  });
  return { existing: mk("a"), fresh: mk("b"), log };
}

async function openStore(): Promise<LocalStore> {
  const s = createSqlLocalStore(createNodeSqliteExecutor());
  await s.init();
  return s;
}

function msg(i: number, conv: string, body: string): MessageRow {
  const sent = new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
  return {
    id: `${conv}-m${i}`,
    conversation_id: conv,
    sender_user_id: "u1",
    sender_device_id: null,
    sent_at: sent,
    received_at: sent,
    kind: "text",
    body,
    reply_to_id: null,
    edited_at: null,
    deleted: 0,
    status: null,
    media_json: null,
  };
}

async function seed(
  store: LocalStore,
  convs: number,
  per: number,
  body?: string,
) {
  for (let c = 0; c < convs; c++) {
    await store.upsertConversations([
      {
        id: `c${c}`,
        kind: "direct",
        title: `chat ${c}`,
        avatar: null,
        last_message_id: null,
        unread_count: 0,
        updated_at: new Date(Date.UTC(2026, 0, 1, 0, c)).toISOString(),
      },
    ]);
    await store.upsertMessages(
      Array.from({ length: per }, (_, i) =>
        msg(i, `c${c}`, body ?? `hello ${i}`),
      ),
    );
  }
  await store.setReaction({ message_id: "c0-m1", user_id: "u2", emoji: "+1" });
  await store.upsertReceipt({
    message_id: "c0-m1",
    user_id: "u2",
    delivered_at: "2026-01-01T00:00:00Z",
    read_at: null,
  });
}

const device = {
  deviceId: "dev-new",
  name: "New",
  platform: "web",
  identityKey: "curve-identity-key",
  signingKey: "sk",
};

async function link(opts: {
  convs: number;
  per: number;
  body?: string;
  archive?: ArchiveStorage;
  decline?: boolean;
}) {
  const t = pair();
  const src = await openStore();
  const dst = await openStore();
  await seed(src, opts.convs, opts.per, opts.body);
  const accountSeed = ed25519.utils.randomPrivateKey();
  const progress: number[] = [];
  const codes: string[] = [];
  const fresh = startNewDeviceLink({
    transport: t.fresh,
    store: dst,
    device,
    archive: opts.archive,
    confirmSafetyCode: async () => true,
    onSafetyCode: (c) => codes.push(c),
    onProgress: (p) => progress.push(p.done),
  });
  const newRun = fresh.run();
  const exRun = runExistingDeviceLink({
    transport: t.existing,
    qrText: fresh.qrText,
    store: src,
    accountSeed,
    archive: opts.archive,
    confirm: async (_i, code) => {
      codes.push(code);
      return !opts.decline;
    },
  });
  return { t, src, dst, accountSeed, progress, codes, newRun, exRun };
}

describe("link QR", () => {
  it("round-trips and rejects junk", () => {
    const qr = {
      v: 1 as const,
      pub: toB64(new Uint8Array(32).fill(7)),
      deviceId: "d1",
      nonce: toB64(new Uint8Array(16).fill(1)),
    };
    expect(parseLinkQr(encodeLinkQr(qr))).toEqual(qr);
    expect(parseLinkQr("hello")).toBeNull();
    expect(parseLinkQr("pulse-link:1:@@@")).toBeNull();
    expect(linkTopic(qr.nonce)).toBe(`link:${qr.nonce}`);
  });
});

describe("QR device linking", () => {
  it("moves the account key (same public key, so same Security Code)", async () => {
    const r = await link({ convs: 2, per: 5 });
    const [out] = await Promise.all([r.newRun, r.exRun]);
    expect(out.accountSigningKey).toBe(accountPublicKey(r.accountSeed));
    expect(Array.from(out.accountSeed)).toEqual(Array.from(r.accountSeed));
    expect(r.codes[0]).toMatch(/^\d{6}$/);
    expect(r.codes[0]).toBe(r.codes[1]);
  });

  it("transfers messages, reactions and receipts, newest chats first, with progress", async () => {
    const r = await link({ convs: 3, per: 4 });
    const [out] = await Promise.all([r.newRun, r.exRun]);
    expect(out.imported).toBe(12);
    expect((await r.dst.listConversations()).map((c) => c.id).sort()).toEqual([
      "c0",
      "c1",
      "c2",
    ]);
    expect(await r.dst.countMessages("c0")).toBe(4);
    expect(await r.dst.listReactions(["c0-m1"])).toHaveLength(1);
    expect(await r.dst.listReceipts(["c0-m1"])).toHaveLength(1);
    expect(r.progress.length).toBeGreaterThan(0);
    expect(r.progress[r.progress.length - 1]).toBe(12);
  });

  it("relay carries only ciphertext", async () => {
    const r = await link({ convs: 1, per: 3, body: "SECRET-PLAINTEXT" });
    await Promise.all([r.newRun, r.exRun]);
    const wire = JSON.stringify(r.t.log);
    expect(wire).not.toContain("SECRET-PLAINTEXT");
    expect(wire).not.toContain(toB64(r.accountSeed));
    expect(r.t.log.filter((f) => f.t === "hello")).toHaveLength(1);
  });

  it("stops when the user declines and sends no key", async () => {
    const r = await link({ convs: 1, per: 2, decline: true });
    const res = await Promise.allSettled([r.newRun, r.exRun]);
    expect(res[0].status).toBe("rejected");
    expect((res[1] as PromiseRejectedResult).reason).toMatchObject({
      code: "declined",
    });
    expect(await r.dst.listConversations()).toHaveLength(0);
  });

  it("uses one encrypted archive above 5 MB", async () => {
    const blobs = new Map<string, Uint8Array>();
    const archive: ArchiveStorage = {
      async upload(b) {
        const id = `r2/${blobs.size}`;
        blobs.set(id, b);
        return id;
      },
      async download(id) {
        return blobs.get(id)!;
      },
    };
    const r = await link({
      convs: 2,
      per: 60,
      body: "BIGBODY" + "x".repeat(50_000),
      archive,
    });
    const [out] = await Promise.all([r.newRun, r.exRun]);
    expect(blobs.size).toBe(1);
    const blob = new TextDecoder("latin1").decode([...blobs.values()][0]);
    expect(blob).not.toContain("BIGBODY");
    expect(out.imported).toBe(120);
    expect(JSON.stringify(r.t.log)).not.toContain("BIGBODY");
  });

  it("10,000 messages transfer well inside 60 s", async () => {
    const t0 = Date.now();
    const r = await link({ convs: 10, per: 1000 });
    const [out] = await Promise.all([r.newRun, r.exRun]);
    expect(out.imported).toBe(10_000);
    expect(Date.now() - t0).toBeLessThan(30_000);
  }, 60_000);

  it("refuses a QR whose device id does not match", async () => {
    const t = pair();
    const dst = await openStore();
    const fresh = startNewDeviceLink({
      transport: t.fresh,
      store: dst,
      device,
      confirmSafetyCode: async () => true,
      timeoutMs: 500,
    });
    const qr = parseLinkQr(fresh.qrText)!;
    const forged = encodeLinkQr({ ...qr, deviceId: "someone-else" });
    const p = fresh.run().catch((e) => e);
    await expect(
      runExistingDeviceLink({
        transport: t.existing,
        qrText: forged,
        store: await openStore(),
        accountSeed: new Uint8Array(32).fill(1),
        confirm: async () => true,
        timeoutMs: 500,
      }),
    ).rejects.toBeInstanceOf(LinkError);
    await p;
  });
});

/** Plays the existing device by hand so tests can send frames a real one never would. */
async function scripted(t: ReturnType<typeof pair>, fresh: { qrText: string }) {
  const qr = parseLinkQr(fresh.qrText)!;
  const eph = createEphemeralKey();
  const ch = createLinkChannel({
    role: "existing",
    nonce: qr.nonce,
    ownSecret: eph.secret,
    newPub: qr.pub,
    existingPub: eph.pub,
  });
  await t.existing.send({ t: "hello", r: "existing", pub: eph.pub });
  return {
    ch,
    send: (m: unknown) => t.existing.send(ch.seal(m)),
  };
}

function newSide(
  t: ReturnType<typeof pair>,
  dst: LocalStore,
  extra: object = {},
) {
  const seeds: Uint8Array[] = [];
  const fresh = startNewDeviceLink({
    transport: t.fresh,
    store: dst,
    device,
    confirmSafetyCode: async () => true,
    onAccountKey: (s) => void seeds.push(s),
    timeoutMs: 1000,
    ...extra,
  });
  return { fresh, seeds };
}

const SEED = toB64(new Uint8Array(32).fill(3));
const goodMsg = (id: string) => ({ t: "message", row: msg(1, "c0", id) });

describe("hardened QR link", () => {
  it("ignores a second hello once one is bound", async () => {
    const t = pair();
    const injected: ((f: LinkFrame) => void)[] = [];
    const fresh = startNewDeviceLink({
      transport: {
        send: (f) => t.fresh.send(f),
        subscribe: (l) => {
          injected.push(l);
          return t.fresh.subscribe(l);
        },
      },
      store: await openStore(),
      device,
      confirmSafetyCode: async () => true,
      timeoutMs: 1000,
      onSafetyCode: () => {
        codes++;
        const evil = createEphemeralKey();
        queueMicrotask(() =>
          injected.forEach((l) =>
            l({ t: "hello", r: "existing", pub: evil.pub }),
          ),
        );
      },
    });
    let codes = 0;
    const run = fresh.run();
    const ex = runExistingDeviceLink({
      transport: t.existing,
      qrText: fresh.qrText,
      store: await openStore(),
      accountSeed: new Uint8Array(32).fill(5),
      confirm: async () => true,
    });
    const [out] = await Promise.all([run, ex]);
    expect(out.accountSeed).toEqual(new Uint8Array(32).fill(5));
    expect(codes).toBe(1);
  });

  it("rejects malformed and oversized frames", async () => {
    expect(
      parseLinkFrame({ t: "hello", r: "existing", pub: "AAAA" }),
    ).toBeNull();
    expect(parseLinkFrame({ t: "msg", r: "new", n: "1", c: "x" })).toBeNull();
    expect(
      parseLinkFrame({ t: "msg", r: "new", n: 1, c: "x".repeat(500_000) }),
    ).toBeNull();
    expect(parseLinkFrame({ t: "nope" })).toBeNull();
    expect(parseLinkFrame(null)).toBeNull();
    const e = createEphemeralKey();
    expect(
      parseLinkFrame({ t: "hello", r: "existing", pub: e.pub }),
    ).not.toBeNull();
    const t = pair();
    const dst = await openStore();
    const { fresh, seeds } = newSide(t, dst);
    const run = fresh.run().catch((x) => x);
    const s = await scripted(t, fresh);
    await s.send({ t: "account_key", seed: "not a key!!" });
    expect(await run).toMatchObject({ code: "protocol" });
    expect(seeds).toHaveLength(0);
    // frame-level: oversized ciphertext never reaches decryption
    const a = createEphemeralKey();
    const b = createEphemeralKey();
    const ch = createLinkChannel({
      role: "new",
      nonce: "n",
      ownSecret: a.secret,
      newPub: a.pub,
      existingPub: b.pub,
    });
    expect(() =>
      ch.open({ t: "msg", r: "existing", n: 1, c: "x".repeat(500_000) }),
    ).toThrow(LinkError);
  });

  it("fails history_end when a chunk is missing", async () => {
    const t = pair();
    const { fresh } = newSide(t, await openStore());
    const run = fresh.run().catch((x) => x);
    const s = await scripted(t, fresh);
    await s.send({ t: "account_key", seed: SEED });
    await s.send({
      t: "history_begin",
      records: 2,
      messages: 2,
      chunks: 2,
      mode: "chunks",
    });
    await s.send({ t: "history_chunk", i: 0, records: [goodMsg("a")] });
    await s.send({ t: "history_end" });
    expect(await run).toMatchObject({ code: "history" });
  });

  it("rejects out-of-order and surplus chunks", async () => {
    const t = pair();
    const { fresh } = newSide(t, await openStore());
    const run = fresh.run().catch((x) => x);
    const s = await scripted(t, fresh);
    await s.send({ t: "account_key", seed: SEED });
    await s.send({
      t: "history_begin",
      records: 1,
      messages: 1,
      chunks: 1,
      mode: "chunks",
    });
    await s.send({ t: "history_chunk", i: 1, records: [goodMsg("a")] });
    expect(await run).toMatchObject({ code: "history" });
  });

  it("a bad record rejects the whole import and writes nothing", async () => {
    const t = pair();
    const dst = await openStore();
    const { fresh } = newSide(t, dst);
    const run = fresh.run().catch((x) => x);
    const s = await scripted(t, fresh);
    await s.send({ t: "account_key", seed: SEED });
    await s.send({
      t: "history_begin",
      records: 2,
      messages: 2,
      chunks: 2,
      mode: "chunks",
    });
    await s.send({ t: "history_chunk", i: 0, records: [goodMsg("a")] });
    await s.send({
      t: "history_chunk",
      i: 1,
      records: [{ t: "message", row: { id: 5, body: "x" } }],
    });
    await s.send({ t: "history_end" });
    expect(await run).toMatchObject({ code: "history" });
    expect(await dst.countMessages("c0")).toBe(0);
  });

  it("new device refuses account_key until the code is confirmed", async () => {
    const t = pair();
    let confirm!: (ok: boolean) => void;
    const gate = new Promise<boolean>((r) => (confirm = r));
    const { fresh, seeds } = newSide(t, await openStore(), {
      confirmSafetyCode: () => gate,
    });
    const run = fresh.run().catch((x) => x);
    const s = await scripted(t, fresh);
    await s.send({ t: "account_key", seed: SEED });
    await new Promise((r) => setTimeout(r, 50));
    expect(seeds).toHaveLength(0);
    confirm(false);
    expect(await run).toMatchObject({ code: "declined" });
    expect(seeds).toHaveLength(0);
  });

  it("accepts account_key after the code is confirmed", async () => {
    const t = pair();
    const { fresh, seeds } = newSide(t, await openStore());
    const run = fresh.run().catch((x) => x);
    const s = await scripted(t, fresh);
    await s.send({ t: "account_key", seed: SEED });
    await s.send({
      t: "history_begin",
      records: 0,
      messages: 0,
      chunks: 0,
      mode: "chunks",
    });
    await s.send({ t: "history_end" });
    expect(await run).toMatchObject({ imported: 0 });
    expect(seeds).toHaveLength(1);
  });
});
