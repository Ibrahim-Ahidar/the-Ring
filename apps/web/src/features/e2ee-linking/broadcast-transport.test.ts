import { describe, expect, it } from "vitest";

import { openLinkTransport } from "./broadcast-transport";

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

describe("openLinkTransport", () => {
  it("resolves when subscribed, sends frames, and keeps early frames", async () => {
    const f = fakeClient();
    const { transport } = await openLinkTransport(f.client, "link:abc");
    await transport.send({ t: "hello", r: "existing", pub: "P" });
    expect(f.sent).toEqual([{ t: "hello", r: "existing", pub: "P" }]);
    f.deliver({ t: "msg", r: "new", n: "n", c: "c" });
    const got: unknown[] = [];
    transport.subscribe((x) => got.push(x));
    f.deliver({ t: "msg", r: "new", n: "n2", c: "c2" });
    expect(got).toHaveLength(2);
  });
});
