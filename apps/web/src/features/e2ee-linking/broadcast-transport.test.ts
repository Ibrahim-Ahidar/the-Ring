import { describe, expect, it } from "vitest";

import { MAX_EARLY_FRAMES, openLinkTransport } from "./broadcast-transport";

function fakeClient() {
  const sent: unknown[] = [];
  let cb: ((m: { payload: unknown }) => void) | null = null;
  const channel = {
    on(_t: string, _f: unknown, c: (m: { payload: unknown }) => void) {
      cb = c;
      return channel;
    },
    subscribe(s?: (st: string) => void) {
      queueMicrotask(() => s?.("SUBSCRIBED"));
    },
    async send(m: { payload: unknown }) {
      sent.push(m.payload);
    },
  };
  return {
    sent,
    deliver: (p: unknown) => cb?.({ payload: p }),
    client: { channel: () => channel, removeChannel: () => undefined },
  };
}

const PUB = "A".repeat(43);

describe("openLinkTransport", () => {
  it("resolves when subscribed, sends frames, and keeps early frames", async () => {
    const f = fakeClient();
    const { transport } = await openLinkTransport(f.client, "link:abc");
    await transport.send({ t: "hello", r: "existing", pub: PUB });
    expect(f.sent).toEqual([{ t: "hello", r: "existing", pub: PUB }]);
    f.deliver({ t: "msg", r: "new", n: 1, c: "c" });
    const got: unknown[] = [];
    transport.subscribe((x) => got.push(x));
    f.deliver({ t: "msg", r: "new", n: 2, c: "c2" });
    expect(got).toHaveLength(2);
  });

  it("drops malformed frames and caps the early buffer", async () => {
    const f = fakeClient();
    const { transport } = await openLinkTransport(f.client, "link:abc");
    f.deliver({ t: "msg", r: "new", n: "x", c: "c" });
    f.deliver({ t: "msg", r: "new", n: 1, c: "x".repeat(500_000) });
    f.deliver("junk");
    for (let i = 1; i <= MAX_EARLY_FRAMES + 20; i++) f.deliver({ t: "msg", r: "new", n: i, c: "c" });
    const got: unknown[] = [];
    transport.subscribe((x) => got.push(x));
    expect(got).toHaveLength(MAX_EARLY_FRAMES);
    f.deliver({ t: "nope" });
    expect(got).toHaveLength(MAX_EARLY_FRAMES);
  });
});
