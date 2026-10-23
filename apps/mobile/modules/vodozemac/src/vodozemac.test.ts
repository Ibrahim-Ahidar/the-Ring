import { createVodozemac, fromB64, toB64, type NativeVodozemac } from "./index";

// Native side mocked: a fake that "encrypts" by tagging, enough to check the JS layer's
// base64 handling, handle passing and Olm/Megolm flow. The real round trip needs a device.
function fakeNative(): NativeVodozemac {
  let n = 0;
  const id = () => `h${++n}`;
  return {
    release: jest.fn(),
    accountNew: async () => id(),
    accountFromPickle: async () => id(),
    accountPickle: async (h, k) => `pickle:${h}:${k}`,
    accountIdentityKeys: async () => ({ ed25519: "ed", curve25519: "cu" }),
    accountSign: async (_h, m) => `sig:${m}`,
    accountGenerateOneTimeKeys: async () => {},
    accountOneTimeKeys: async () => ["otk1"],
    accountMarkKeysAsPublished: async () => {},
    accountCreateOutboundSession: async () => "out",
    accountCreateInboundSession: async (_h, _k, type, body) => ({
      session: "in",
      plaintext: type === 0 ? body.replace("enc:", "") : "",
    }),
    sessionFromPickle: async () => id(),
    sessionPickle: async () => "sp",
    sessionId: async (h) => `sid-${h}`,
    sessionEncrypt: async (_h, pt) => ({ type: 0, body: `enc:${pt}` }),
    sessionDecrypt: async (_h, _t, body) => body.replace("enc:", ""),
    groupNew: async () => id(),
    groupFromPickle: async () => id(),
    groupPickle: async () => "gp",
    groupSessionId: async () => "gid",
    groupSessionKey: async () => "gkey",
    groupEncrypt: async (_h, pt) => `menc:${pt}`,
    inboundNew: async () => id(),
    inboundFromPickle: async () => id(),
    inboundPickle: async () => "ip",
    inboundSessionId: async () => "gid",
    inboundDecrypt: async (_h, m) => ({ plaintext: m.replace("menc:", ""), messageIndex: 0 }),
  };
}

const text = (s: string) => new TextEncoder().encode(s);
const str = (b: Uint8Array) => new TextDecoder().decode(b);

describe("vodozemac JS layer", () => {
  it("round-trips bytes through base64", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    expect(Array.from(fromB64(toB64(bytes)))).toEqual(Array.from(bytes));
  });

  it("sets up an Olm session and round-trips a message", async () => {
    const v = createVodozemac(fakeNative());
    const alice = await v.newAccount();
    const bob = await v.newAccount();
    await bob.generateOneTimeKeys(1);
    const [otk] = await bob.oneTimeKeys();
    const bobKeys = await bob.identityKeys();
    const out = await alice.createOutboundSession(bobKeys.curve25519, otk);
    const msg = await out.encrypt(text("hello é"));
    const inbound = await bob.createInboundSession((await alice.identityKeys()).curve25519, msg);
    expect(str(inbound.plaintext)).toBe("hello é");
    expect(str(await inbound.session.decrypt(msg))).toBe("hello é");
  });

  it("round-trips a Megolm group message", async () => {
    const v = createVodozemac(fakeNative());
    const out = await v.newGroupSession();
    const inbound = await v.newInboundGroupSession(await out.sessionKey());
    const ct = await out.encrypt(text("group"));
    const d = await inbound.decrypt(ct);
    expect(str(d.plaintext)).toBe("group");
    expect(await inbound.sessionId()).toBe(await out.sessionId());
  });

  it("passes the pickle key as base64 and frees handles", async () => {
    const native = fakeNative();
    const v = createVodozemac(native);
    const acct = await v.newAccount();
    expect(await acct.pickle(new Uint8Array(32))).toContain(toB64(new Uint8Array(32)));
    acct.free();
    expect(native.release).toHaveBeenCalledWith(acct.handle);
  });
});
