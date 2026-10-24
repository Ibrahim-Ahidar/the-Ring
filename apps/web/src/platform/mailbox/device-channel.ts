import { asRpcClient } from "@pulse/core/rpc";
import { createMailboxReceiver, type MailboxReceiver } from "@pulse/core/mailbox/receiver";
import type { BroadcastFrame, MailboxEnvelope } from "@pulse/core/mailbox/types";

import { createSupabaseBrowserClient } from "@/platform/supabase/browser";

/** The slice of a Supabase Realtime channel the mailbox needs (lets tests fake it). */
export type BroadcastChannelLike = {
  on(
    type: "broadcast",
    filter: { event: string },
    cb: (msg: { payload: unknown }) => void,
  ): BroadcastChannelLike;
  subscribe(cb?: (status: string) => void): BroadcastChannelLike;
  unsubscribe(): unknown;
};

export type MailboxSubscription = { receiver: MailboxReceiver; stop(): void };

export function deviceTopic(deviceId: string): string {
  return `device:${deviceId}`;
}

/**
 * Listens on the private device:<id> topic and catches up with fetch_mailbox on every
 * (re)subscribe, so a missed Broadcast is never lost. Both paths feed one deduping receiver.
 */
export function startMailbox(args: {
  deviceId: string;
  onEnvelope: (e: MailboxEnvelope) => Promise<void> | void;
  channel: BroadcastChannelLike;
  receiver: MailboxReceiver;
}): MailboxSubscription {
  const { channel, receiver } = args;
  channel
    .on("broadcast", { event: "mailbox" }, (msg) => {
      void receiver.handleFrame(msg.payload as BroadcastFrame);
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") void receiver.sync();
    });
  return {
    receiver,
    stop() {
      void channel.unsubscribe();
    },
  };
}

/** Browser wiring: private channel on the shared Supabase client. */
export function startBrowserMailbox(
  deviceId: string,
  onEnvelope: (e: MailboxEnvelope) => Promise<void> | void,
): MailboxSubscription {
  const supabase = createSupabaseBrowserClient();
  const receiver = createMailboxReceiver({
    client: asRpcClient(supabase),
    deviceId,
    onEnvelope,
  });
  const channel = supabase.channel(deviceTopic(deviceId), {
    config: { private: true },
  }) as unknown as BroadcastChannelLike;
  return startMailbox({ deviceId, onEnvelope, channel, receiver });
}
