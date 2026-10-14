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
  /** Null until the (deferred) start has created the channel. */
  channel: RealtimeChannel | null;
  refs: number;
  listeners: Listeners;
  lastStatus: string | null;
  /** Resolves once the channel exists and `subscribe` has been called. */
  started: Promise<void>;
  /** Set once the entry was torn down; a pending start must then do nothing. */
  dead: boolean;
  /** Pending deferred removal, cancelled when the topic is re-joined. */
  idleTimer: ReturnType<typeof setTimeout> | null;
  stopAuth: (() => void) | null;
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
const removals = new WeakMap<SupabaseClient, Map<string, Promise<unknown>>>();

function entriesFor(supabase: SupabaseClient): Map<string, Entry> {
  let map = registry.get(supabase);
  if (!map) {
    map = new Map();
    registry.set(supabase, map);
  }
  return map;
}

function removalsFor(supabase: SupabaseClient): Map<string, Promise<unknown>> {
  let map = removals.get(supabase);
  if (!map) {
    map = new Map();
    removals.set(supabase, map);
  }
  return map;
}

/**
 * Postgres Changes are filtered by RLS using the JWT the socket joined with.
 * If the channel joins with the anon key (session not read from cookies yet)
 * the subscription succeeds but no protected row is ever delivered, so make
 * sure the socket holds the user's token before subscribing.
 */
async function applyRealtimeAuth(supabase: SupabaseClient): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) {
      await supabase.realtime.setAuth(token);
    }
  } catch {
    // Fall back to whatever the client already configured.
  }
}

/** Delay before an unreferenced channel is removed (survives effect re-runs). */
const IDLE_REMOVAL_MS = 0;

function createEntry(
  supabase: SupabaseClient,
  topic: string,
  tables: TableSubscription[],
  presenceKey: string,
): Entry {
  const listeners: Listeners = {
    change: new Set(),
    broadcast: new Set(),
    presence: new Set(),
    status: new Set(),
  };
  const entry: Entry = {
    channel: null,
    refs: 0,
    listeners,
    lastStatus: null,
    started: Promise.resolve(),
    dead: false,
    idleTimer: null,
    stopAuth: null,
  };

  entry.started = (async () => {
    // A previous channel for this topic may still be leaving; creating a new
    // one before it is gone can reuse it or let its server-side leave kill us.
    const leaving = removalsFor(supabase).get(topic);
    if (leaving) {
      await leaving.catch(() => undefined);
    }
    if (entry.dead) return;
    await applyRealtimeAuth(supabase);
    if (entry.dead) return;

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

    entry.channel = channel;
    channel.subscribe((status) => {
      entry.lastStatus = status;
      listeners.status.forEach((cb) => cb(status));
    });

    // Keep the socket's JWT fresh across refreshes.
    const auth = supabase.auth?.onAuthStateChange?.((event, session) => {
      if (
        (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") &&
        session?.access_token
      ) {
        void supabase.realtime.setAuth(session.access_token);
      }
    });
    entry.stopAuth = () => auth?.data?.subscription?.unsubscribe();
  })();

  return entry;
}

function teardown(supabase: SupabaseClient, topic: string, entry: Entry): void {
  const entries = entriesFor(supabase);
  if (entries.get(topic) === entry) {
    entries.delete(topic);
  }
  entry.dead = true;
  entry.stopAuth?.();
  entry.stopAuth = null;
  const channel = entry.channel;
  if (!channel) return;
  const map = removalsFor(supabase);
  const done = Promise.resolve(supabase.removeChannel(channel)).catch(
    () => undefined,
  );
  map.set(topic, done);
  void done.then(() => {
    if (map.get(topic) === done) map.delete(topic);
  });
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
    entry = createEntry(supabase, topic, tables, presenceKey);
    entries.set(topic, entry);
  }

  const current = entry;
  if (current.idleTimer) {
    clearTimeout(current.idleTimer);
    current.idleTimer = null;
  }
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
      await current.started;
      await current.channel?.send({ type: "broadcast", event, payload });
    },
    async track(meta) {
      await current.started;
      await current.channel?.track(meta);
    },
    async untrack() {
      await current.started;
      await current.channel?.untrack();
    },
    leave() {
      if (left) return;
      left = true;
      [...owned].forEach((remove) => remove());
      current.refs -= 1;
      if (current.refs <= 0 && !current.idleTimer) {
        // Defer: a strict-mode / effect re-run re-joins synchronously and
        // should reuse the live channel instead of tearing it down.
        current.idleTimer = setTimeout(() => {
          current.idleTimer = null;
          if (current.refs <= 0) teardown(supabase, topic, current);
        }, IDLE_REMOVAL_MS);
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
      { table: "message_hides", filter: `user_id=eq.${userId}` },
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
      // Unfiltered so the peer's read/delivered cursors reach the chat list;
      // RLS limits rows to conversations the viewer belongs to.
      { table: "conversation_members" },
      { table: "conversations" },
      { table: "notifications", filter: `recipient_id=eq.${userId}` },
    ],
    userId,
  );
}
