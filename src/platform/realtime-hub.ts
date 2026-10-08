import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import { conversationChannel, inboxChannel } from "@/platform/realtime";

/**
 * Supabase returns the same channel object for the same topic, so two
 * features that each subscribe or remove `conversation:{id}` would break each
 * other. Every feature joins through this hub instead: one channel per topic,
 * reference counted, with listeners fanned out from a single subscription.
 */

export type RowChange = {
  table: string;
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

export type PresenceState = Record<string, Array<Record<string, unknown>>>;

type Listeners = {
  change: Set<(change: RowChange) => void>;
  broadcast: Set<(event: string, payload: Record<string, unknown>) => void>;
  presence: Set<(state: PresenceState) => void>;
  status: Set<(status: string) => void>;
};

type Entry = {
  channel: RealtimeChannel;
  refs: number;
  listeners: Listeners;
  lastStatus: string | null;
};

export type TopicHandle = {
  onChange(cb: (change: RowChange) => void): () => void;
  onBroadcast(
    cb: (event: string, payload: Record<string, unknown>) => void,
  ): () => void;
  onPresence(cb: (state: PresenceState) => void): () => void;
  /** Receives `SUBSCRIBED`, `CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`. */
  onStatus(cb: (status: string) => void): () => void;
  send(event: string, payload: Record<string, unknown>): Promise<void>;
  track(meta: Record<string, unknown>): Promise<void>;
  untrack(): Promise<void>;
  /** Releases this handle; the channel is removed when the last handle leaves. */
  leave(): void;
};

type TableSubscription = { table: string; filter?: string };

const registry = new WeakMap<SupabaseClient, Map<string, Entry>>();

function entriesFor(supabase: SupabaseClient): Map<string, Entry> {
  let map = registry.get(supabase);
  if (!map) {
    map = new Map();
    registry.set(supabase, map);
  }
  return map;
}

function join(
  supabase: SupabaseClient,
  topic: string,
  tables: TableSubscription[],
  presenceKey: string,
): TopicHandle {
  const entries = entriesFor(supabase);
  let entry = entries.get(topic);

  if (!entry) {
    const listeners: Listeners = {
      change: new Set(),
      broadcast: new Set(),
      presence: new Set(),
      status: new Set(),
    };
    const channel = supabase.channel(topic, {
      config: { broadcast: { self: false }, presence: { key: presenceKey } },
    });
    for (const { table, filter } of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
        (payload) => {
          const change: RowChange = {
            table,
            eventType: payload.eventType,
            new: (payload.new ?? {}) as Record<string, unknown>,
            old: (payload.old ?? {}) as Record<string, unknown>,
          };
          listeners.change.forEach((cb) => cb(change));
        },
      );
    }
    channel.on("broadcast", { event: "*" }, (message) => {
      const payload = (message.payload ?? {}) as Record<string, unknown>;
      listeners.broadcast.forEach((cb) => cb(message.event, payload));
    });
    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState() as PresenceState;
      listeners.presence.forEach((cb) => cb(state));
    });

    const created: Entry = { channel, refs: 0, listeners, lastStatus: null };
    channel.subscribe((status) => {
      created.lastStatus = status;
      listeners.status.forEach((cb) => cb(status));
    });
    entry = created;
    entries.set(topic, entry);
  }

  const current = entry;
  current.refs += 1;
  const owned = new Set<() => void>();

  function add<T>(set: Set<T>, cb: T): () => void {
    set.add(cb);
    const remove = () => {
      set.delete(cb);
      owned.delete(remove);
    };
    owned.add(remove);
    return remove;
  }

  let left = false;
  return {
    onChange: (cb) => add(current.listeners.change, cb),
    onBroadcast: (cb) => add(current.listeners.broadcast, cb),
    onPresence: (cb) => add(current.listeners.presence, cb),
    onStatus: (cb) => {
      const remove = add(current.listeners.status, cb);
      if (current.lastStatus) cb(current.lastStatus);
      return remove;
    },
    async send(event, payload) {
      await current.channel.send({ type: "broadcast", event, payload });
    },
    async track(meta) {
      await current.channel.track(meta);
    },
    async untrack() {
      await current.channel.untrack();
    },
    leave() {
      if (left) return;
      left = true;
      [...owned].forEach((remove) => remove());
      current.refs -= 1;
      if (current.refs <= 0) {
        entries.delete(topic);
        void supabase.removeChannel(current.channel);
      }
    },
  };
}

/** `conversation:{id}`: message, reaction, and membership rows, typing broadcast, presence. */
export function joinConversation(
  supabase: SupabaseClient,
  conversationId: string,
  userId: string,
): TopicHandle {
  return join(
    supabase,
    conversationChannel(conversationId),
    [
      { table: "messages", filter: `conversation_id=eq.${conversationId}` },
      { table: "message_reactions" },
      {
        table: "conversation_members",
        filter: `conversation_id=eq.${conversationId}`,
      },
    ],
    userId,
  );
}

/** `inbox:{userId}`: membership, conversation summary, and notification rows. */
export function joinInbox(supabase: SupabaseClient, userId: string): TopicHandle {
  return join(
    supabase,
    inboxChannel(userId),
    [
      { table: "conversation_members", filter: `user_id=eq.${userId}` },
      { table: "conversations" },
      { table: "notifications", filter: `recipient_id=eq.${userId}` },
    ],
    userId,
  );
}
