/**
 * Applies decrypted Control Messages (spec 5.1) to the local store. Controls never create
 * bubbles. Reactions, receipts and read marks need no target row, so they are stored at once.
 * Edit, delete, pin and audio_play need their target: when it has not arrived yet (envelopes
 * from different paths can arrive in any order) the control is queued in kv under the target
 * id and replayed when the target is stored. A control from someone who may not make it
 * (editing another person's message) is dropped. Everything is idempotent and last-writer
 * wins by `sentAt`, so replays and duplicates converge.
 */
import type { LocalStore, MessageRow } from "../local-store";
import type { ControlEnvelope, PlainEnvelope } from "./plain-envelope";
import { isControlEnvelope } from "./plain-envelope";

export type ControlStore = Pick<
  LocalStore,
  | "getMessage"
  | "upsertMessages"
  | "setReaction"
  | "removeReaction"
  | "upsertReceipt"
  | "listReceipts"
  | "getKv"
  | "setKv"
  | "listKv"
  | "deleteKv"
>;

export type ControlOutcome = "applied" | "queued" | "dropped";

export type ControlContext = {
  selfUserId: string;
  /** The authenticated sender from the server envelope (never from the plaintext). */
  senderUserId: string | null;
};

const QUEUE_PREFIX = "ctl:";
/** Per target; beyond this further controls are dropped (bounds kv growth). */
const MAX_QUEUED_PER_TARGET = 20;

const readMark = (conversationId: string) => `read:${conversationId}`;
const lastOp = (kind: string, messageId: string, userId: string) =>
  `ctlts:${kind}:${messageId}:${userId}`;
export const pinKey = (messageId: string) => `pin:${messageId}`;
export const audioPlayKey = (messageId: string) => `audio_play:${messageId}`;

/** Local read marker: sent_at of the newest message the user has seen in the conversation. */
export function getReadMarker(
  store: Pick<LocalStore, "getKv">,
  conversationId: string,
): Promise<string | null> {
  return store.getKv(readMark(conversationId));
}

/** Last-writer-wins gate: true when `sentAt` is newer than what was last applied for the key. */
async function fresh(store: ControlStore, key: string, sentAt: string): Promise<boolean> {
  const prev = await store.getKv(key);
  if (prev && Date.parse(prev) >= Date.parse(sentAt)) return false;
  await store.setKv(key, sentAt);
  return true;
}

async function advanceReadMarker(
  store: Pick<LocalStore, "getKv" | "setKv">,
  conversationId: string,
  sentAt: string,
) {
  const cur = await store.getKv(readMark(conversationId));
  if (!cur || Date.parse(cur) < Date.parse(sentAt)) {
    await store.setKv(readMark(conversationId), sentAt);
  }
}

async function queue(
  store: ControlStore,
  targetId: string,
  p: ControlEnvelope,
  ctx: ControlContext,
) {
  const existing = await store.listKv(`${QUEUE_PREFIX}${targetId}:`);
  if (existing.length >= MAX_QUEUED_PER_TARGET) return;
  await store.setKv(
    `${QUEUE_PREFIX}${targetId}:${p.id}`,
    JSON.stringify({ p, senderUserId: ctx.senderUserId }),
  );
}

async function applyToTarget(
  store: ControlStore,
  p: ControlEnvelope,
  ctx: ControlContext,
  target: MessageRow,
): Promise<ControlOutcome> {
  if (target.conversation_id !== p.conversationId) return "dropped";
  const sender = ctx.senderUserId ?? "";
  switch (p.kind) {
    case "edit": {
      if (target.sender_user_id !== sender || target.deleted) return "dropped";
      if (!(await fresh(store, lastOp("edit", target.id, sender), p.sentAt))) return "dropped";
      await store.upsertMessages([{ ...target, body: p.body.body, edited_at: p.sentAt }]);
      return "applied";
    }
    case "delete": {
      if (target.sender_user_id !== sender) return "dropped";
      // Tombstone: the row stays (so a late text cannot resurrect it) with the body gone.
      await store.upsertMessages([{ ...target, deleted: 1, body: null, media_json: null }]);
      return "applied";
    }
    case "pin": {
      if (!(await fresh(store, lastOp("pin", target.id, sender), p.sentAt))) return "dropped";
      if (p.body.pinned) await store.setKv(pinKey(target.id), p.sentAt);
      else await store.deleteKv(pinKey(target.id));
      return "applied";
    }
    case "audio_play": {
      const prev = await store.getKv(audioPlayKey(target.id));
      const set = new Set<string>(prev ? (JSON.parse(prev) as string[]) : []);
      set.add(sender);
      await store.setKv(audioPlayKey(target.id), JSON.stringify([...set]));
      return "applied";
    }
    default:
      return "dropped";
  }
}

/** Applies one control. Never throws for bad input; storage errors do throw (un-acked, retried). */
export async function applyControl(
  store: ControlStore,
  p: PlainEnvelope,
  ctx: ControlContext,
): Promise<ControlOutcome> {
  if (!isControlEnvelope(p) || !ctx.senderUserId) return "dropped";
  const sender = ctx.senderUserId;
  switch (p.kind) {
    case "reaction": {
      const { messageId, emoji, remove } = p.body;
      if (!(await fresh(store, lastOp("reaction", messageId, sender), p.sentAt))) return "dropped";
      if (remove) await store.removeReaction(messageId, sender);
      else await store.setReaction({ message_id: messageId, user_id: sender, emoji });
      return "applied";
    }
    case "receipt":
    case "read": {
      const ids = p.body.messageIds;
      const isRead = p.kind === "read";
      const fromSelf = sender === ctx.selfUserId;
      const existing = new Map(
        (await store.listReceipts(ids))
          .filter((r) => r.user_id === sender)
          .map((r) => [r.message_id, r]),
      );
      let newest: string | null = null;
      for (const id of ids) {
        if (fromSelf) {
          // My own other Device read the conversation: that moves the read marker, nothing else.
          if (!isRead) continue;
          const target = await store.getMessage(id);
          if (target && target.sender_user_id !== ctx.selfUserId) {
            if (!newest || Date.parse(target.sent_at) > Date.parse(newest)) newest = target.sent_at;
          }
          continue;
        }
        // Never regress: delivered/read timestamps only ever fill in, never clear.
        const prev = existing.get(id);
        await store.upsertReceipt({
          message_id: id,
          user_id: sender,
          delivered_at: prev?.delivered_at ?? p.sentAt,
          read_at: isRead ? (prev?.read_at ?? p.sentAt) : (prev?.read_at ?? null),
        });
      }
      if (newest) await advanceReadMarker(store, p.conversationId, newest);
      return "applied";
    }
    default: {
      const targetId = p.body.messageId;
      const target = await store.getMessage(targetId);
      if (!target) {
        await queue(store, targetId, p, ctx);
        return "queued";
      }
      return applyToTarget(store, p, ctx, target);
    }
  }
}

/** Replays controls that were waiting for `messageId`; call after the message is stored. */
export async function replayQueuedControls(
  store: ControlStore,
  messageId: string,
  selfUserId: string,
): Promise<number> {
  const queued = await store.listKv(`${QUEUE_PREFIX}${messageId}:`);
  const items: { p: ControlEnvelope; senderUserId: string | null }[] = [];
  for (const q of queued) {
    try {
      items.push(JSON.parse(q.value) as (typeof items)[number]);
    } catch {
      // unreadable queue entry: dropped below
    }
    await store.deleteKv(q.key);
  }
  items.sort((a, b) => Date.parse(a.p.sentAt) - Date.parse(b.p.sentAt));
  let applied = 0;
  for (const it of items) {
    const out = await applyControl(store, it.p, { selfUserId, senderUserId: it.senderUserId });
    if (out === "applied") applied++;
  }
  return applied;
}

export type Tick = "clock" | "failed" | "check" | "double" | "blue";

/**
 * The tick of one of my own messages: clock (outbox) -> check (mailbox insert ok) -> double
 * (a peer's encrypted receipt) -> blue (a peer's read). Derived from stored receipts, which
 * are only ever filled in, so a late outbox write can never move it backwards.
 */
export function deriveTick(
  status: string | null,
  receipts: readonly { user_id: string; delivered_at: string | null; read_at: string | null }[],
  selfUserId: string,
): Tick {
  if (status === "pending") return "clock";
  if (status === "failed") return "failed";
  const others = receipts.filter((r) => r.user_id !== selfUserId);
  if (others.some((r) => r.read_at)) return "blue";
  if (others.some((r) => r.delivered_at)) return "double";
  return "check";
}

/** Unread = other people's messages after the local read marker, from the local store only. */
export async function countLocalUnread(
  store: Pick<LocalStore, "getKv" | "countUnread">,
  conversationId: string,
  selfUserId: string,
): Promise<number> {
  return store.countUnread({
    conversationId,
    selfUserId,
    afterSentAt: await getReadMarker(store, conversationId),
  });
}

/** Marks everything up to `upToSentAt` as seen locally; returns the new unread count. */
export async function markConversationRead(
  store: Pick<LocalStore, "getKv" | "setKv" | "countUnread">,
  conversationId: string,
  selfUserId: string,
  upToSentAt: string,
): Promise<number> {
  await advanceReadMarker(store, conversationId, upToSentAt);
  return countLocalUnread(store, conversationId, selfUserId);
}
