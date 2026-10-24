import type { RpcClient } from "../rpc";
import { ok, type Result } from "../result";
import { fromWire } from "./codec";
import { ackEnvelopes, fetchMailboxPage } from "./client";
import { MAILBOX_PAGE_SIZE, type BroadcastFrame, type MailboxEnvelope } from "./types";

export type ReceiverOptions = {
  client: RpcClient;
  deviceId: string;
  /** Called once per envelope id, in arrival order. Throw to leave the row un-acked. */
  onEnvelope: (envelope: MailboxEnvelope) => Promise<void> | void;
  pageSize?: number;
  /** Ids already processed (e.g. restored from local storage). */
  seen?: Iterable<string>;
};

export type MailboxReceiver = {
  /** Pulls everything after the cursor, page by page, processing and acking each page. */
  sync(): Promise<Result<number>>;
  /** Handles a Broadcast frame: a full envelope, or an id whose row is then fetched. */
  handleFrame(frame: BroadcastFrame): Promise<Result<number>>;
  cursor(): number;
};

/**
 * Receives envelopes from both paths (Broadcast fast path and fetch) and processes each
 * mailbox id at most once. Acks only after the handler succeeded.
 */
export function createMailboxReceiver(opts: ReceiverOptions): MailboxReceiver {
  const pageSize = opts.pageSize ?? MAILBOX_PAGE_SIZE;
  const seen = new Set<string>(opts.seen ?? []);
  let after = 0;
  let chain: Promise<unknown> = Promise.resolve();

  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => undefined);
    return run;
  };

  async function process(e: MailboxEnvelope): Promise<boolean> {
    if (seen.has(e.id)) return false;
    await opts.onEnvelope(e);
    seen.add(e.id);
    return true;
  }

  async function drain(): Promise<Result<number>> {
    let handled = 0;
    for (;;) {
      const page = await fetchMailboxPage(opts.client, opts.deviceId, after, pageSize);
      if (!page.ok) return page;
      if (page.value.length === 0) return ok(handled);
      const ids: string[] = [];
      for (const e of page.value) {
        if (await process(e)) handled++;
        ids.push(e.id);
        after = Math.max(after, e.seq);
      }
      const acked = await ackEnvelopes(opts.client, opts.deviceId, ids);
      if (!acked.ok) return acked;
      if (page.value.length < pageSize) return ok(handled);
    }
  }

  return {
    sync: () => serial(drain),
    handleFrame: (frame) =>
      serial(async () => {
        if (frame.type === "ref") {
          if (seen.has(frame.id)) return ok(0);
          return drain();
        }
        const e = fromWire(frame.envelope);
        if (seen.has(e.id)) return ok(0);
        const handled = await process(e);
        const acked = await ackEnvelopes(opts.client, opts.deviceId, [e.id]);
        if (!acked.ok) return acked;
        return ok(handled ? 1 : 0);
      }),
    cursor: () => after,
  };
}
