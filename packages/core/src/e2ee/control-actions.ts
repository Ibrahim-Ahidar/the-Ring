/**
 * The user-facing side of Control Messages: each action applies to the local store first (so
 * the UI is instant and offline-safe) and then fans the same envelope out to every other
 * Device. A send that fails is parked in kv and retried by `flushPendingControls`.
 */
import type { LocalStore } from "../local-store";
import type { Result } from "../result";
import {
  applyControl,
  countLocalUnread,
  getReadMarker,
  markConversationRead, type ControlStore } from "./controls";
import type { ControlBodies, ControlKind } from "./plain-envelope";

export type ControlSend = <K extends ControlKind>(
  conversationId: string,
  kind: K,
  body: ControlBodies[K],
  meta?: { id?: string; sentAt?: string },
) => Promise<Result<unknown>>;

const PENDING_PREFIX = "ctlout:";
const MAX_READ_IDS = 500;

type Pending = {
  conversationId: string;
  kind: ControlKind;
  body: unknown;
  meta: { id: string; sentAt: string };
};

export type ControlActionsOptions = {
  store: ControlStore & Pick<LocalStore, "countUnread" | "listMessages">;
  selfUserId: string;
  send: ControlSend;
  newId(): string;
  now?: () => Date;
};

export function createControlActions(opts: ControlActionsOptions) {
  const { store, selfUserId } = opts;
  const stamp = () => (opts.now?.() ?? new Date()).toISOString();

  async function dispatch<K extends ControlKind>(
    conversationId: string,
    kind: K,
    body: ControlBodies[K],
    applyLocally: boolean,
  ): Promise<Result<unknown> | null> {
    const meta = { id: opts.newId(), sentAt: stamp() };
    if (applyLocally) {
      await applyControl(
        store,
        { v: 1, id: meta.id, conversationId, sentAt: meta.sentAt, kind, body } as never,
        { selfUserId, senderUserId: selfUserId },
      );
    }
    const res = await opts.send(conversationId, kind, body, meta).catch(
      () => ({ ok: false }) as Result<unknown>,
    );
    if (!res.ok) {
      const p: Pending = { conversationId, kind, body, meta };
      await store.setKv(`${PENDING_PREFIX}${meta.id}`, JSON.stringify(p));
    }
    return res;
  }

  return {
    react: (conversationId: string, messageId: string, emoji: string, remove = false) =>
      dispatch(conversationId, "reaction", { messageId, emoji, remove }, true),
    edit: (conversationId: string, messageId: string, body: string) =>
      dispatch(conversationId, "edit", { messageId, body }, true),
    remove: (conversationId: string, messageId: string) =>
      dispatch(conversationId, "delete", { messageId }, true),
    pin: (conversationId: string, messageId: string, pinned: boolean) =>
      dispatch(conversationId, "pin", { messageId, pinned }, true),
    audioPlay: (conversationId: string, messageId: string) =>
      dispatch(conversationId, "audio_play", { messageId }, true),

    /**
     * Marks the conversation read on this Device and tells the sender(s) and my other Devices.
     * Returns the new local unread count.
     */
    async markRead(conversationId: string): Promise<number> {
      const marker = await getReadMarker(store, conversationId);
      const page = await store.listMessages(conversationId, { limit: MAX_READ_IDS });
      const fresh = page.filter(
        (m) =>
          m.sender_user_id !== selfUserId &&
          !m.deleted &&
          (!marker || Date.parse(m.sent_at) > Date.parse(marker)),
      );
      if (fresh.length === 0) return countLocalUnread(store, conversationId, selfUserId);
      const newest = fresh.reduce((a, m) => (Date.parse(m.sent_at) > Date.parse(a) ? m.sent_at : a), fresh[0]!.sent_at);
      const count = await markConversationRead(store, conversationId, selfUserId, newest);
      await dispatch(conversationId, "read", { messageIds: fresh.map((m) => m.id) }, false);
      return count;
    },

    /** Retries controls whose send failed earlier; returns how many went out. */
    async flushPendingControls(): Promise<number> {
      let sent = 0;
      for (const row of await store.listKv(PENDING_PREFIX)) {
        let p: Pending;
        try {
          p = JSON.parse(row.value) as Pending;
        } catch {
          await store.deleteKv(row.key);
          continue;
        }
        const res = await opts
          .send(p.conversationId, p.kind, p.body as never, p.meta)
          .catch(() => ({ ok: false }) as Result<unknown>);
        if (res.ok) {
          await store.deleteKv(row.key);
          sent++;
        }
      }
      return sent;
    },
  };
}
