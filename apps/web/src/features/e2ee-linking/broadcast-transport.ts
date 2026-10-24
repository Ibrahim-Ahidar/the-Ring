import type { LinkFrame, LinkTransport } from "@pulse/core/linking";

type Channel = {
  on(type: "broadcast", filter: { event: string }, cb: (msg: { payload: unknown }) => void): Channel;
  subscribe(cb?: (status: string) => void): unknown;
  send(msg: { type: "broadcast"; event: string; payload: unknown }): Promise<unknown>;
};
export type LinkBroadcastClient = {
  channel(topic: string): unknown;
  removeChannel(channel: unknown): unknown;
};

const FRAME_EVENT = "link";

export type OpenedTransport = { transport: LinkTransport; close(): void };

/**
 * Opens a Supabase Broadcast channel and resolves once it is SUBSCRIBED (Broadcast does not
 * replay, so nobody may send before this). Frames that arrive before a listener attaches are kept.
 * The relay only ever carries sealed frames (ciphertext).
 */
export function openLinkTransport(
  client: LinkBroadcastClient,
  topic: string,
): Promise<OpenedTransport> {
  return new Promise((resolve, reject) => {
    const channel = client.channel(topic) as Channel;
    const listeners = new Set<(f: LinkFrame) => void>();
    const early: LinkFrame[] = [];
    let ready = false;
    channel.on("broadcast", { event: FRAME_EVENT }, ({ payload }) => {
      const frame = payload as LinkFrame;
      if (listeners.size === 0) early.push(frame);
      else for (const l of [...listeners]) l(frame);
    });
    const transport: LinkTransport = {
      async send(frame) {
        await channel.send({ type: "broadcast", event: FRAME_EVENT, payload: frame });
      },
      subscribe(listener) {
        listeners.add(listener);
        for (const f of early.splice(0)) listener(f);
        return () => listeners.delete(listener);
      },
    };
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED" && !ready) {
        ready = true;
        resolve({ transport, close: () => void client.removeChannel(channel) });
      } else if (!ready && ["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
        void client.removeChannel(channel);
        reject(new Error("link channel unavailable"));
      }
    });
  });
}
