import { createTypingSender } from "./typing-sender";

function setup() {
  let t = 0;
  const sent: string[] = [];
  const timers = new Map<number, { fn: () => void; at: number }>();
  let id = 0;
  const sender = createTypingSender({
    send: (e) => sent.push(e),
    now: () => t,
    setTimer: (fn, ms) => {
      timers.set(++id, { fn, at: t + ms });
      return id;
    },
    clearTimer: (h) => void timers.delete(h as number),
  });
  const advance = (ms: number) => {
    t += ms;
    for (const [k, v] of [...timers]) {
      if (v.at <= t) {
        timers.delete(k);
        v.fn();
      }
    }
  };
  return { sender, sent, advance };
}

describe("typing sender", () => {
  it("sends started once within the throttle window", () => {
    const { sender, sent, advance } = setup();
    sender.input("a");
    advance(1000);
    sender.input("ab");
    expect(sent).toEqual(["typing.started"]);
  });

  it("re-sends started after the throttle window", () => {
    const { sender, sent, advance } = setup();
    sender.input("a");
    advance(2000);
    sender.input("ab");
    advance(1500);
    sender.input("abc");
    expect(sent).toEqual(["typing.started", "typing.started"]);
  });

  it("sends stopped after idle", () => {
    const { sender, sent, advance } = setup();
    sender.input("a");
    advance(3000);
    expect(sent).toEqual(["typing.started", "typing.stopped"]);
  });

  it("sends stopped when the draft empties, and not twice", () => {
    const { sender, sent } = setup();
    sender.input("a");
    sender.input("  ");
    sender.stop();
    expect(sent).toEqual(["typing.started", "typing.stopped"]);
  });
});
