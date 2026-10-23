import { timingArrival } from "@/timing";
import { supabase } from "./client";

type Handlers = {
  change: Set<() => void>;
  broadcast: Set<(event: string, payload: Record<string, unknown>) => void>;
};

type Entry = {
  channel: ReturnType<typeof supabase.channel>;
  handlers: Handlers;
  refs: number;
};

const entries = new Map<string, Entry>();

export type ChatChannelHandle = {
  send: (event: string, payload: Record<string, unknown>) => void;
  release: () => void;
};

/**
 * One shared `conversation:{id}` channel (row changes plus broadcast), reference
 * counted so the messages watcher and typing events never join the same topic twice.
 */
export function acquireChatChannel(
  conversationId: string,
  handlers: {
    onChange?: () => void;
    onBroadcast?: (event: string, payload: Record<string, unknown>) => void;
  },
): ChatChannelHandle {
  let entry = entries.get(conversationId);
  if (!entry) {
    const set: Handlers = { change: new Set(), broadcast: new Set() };
    const channel = supabase.channel(`conversation:${conversationId}`, {
      config: { broadcast: { self: false } },
    });
    const fire = () => set.change.forEach((cb) => cb());
    const tables = [
      { table: "messages", filter: `conversation_id=eq.${conversationId}` },
      { table: "message_reactions" },
      { table: "conversation_members", filter: `conversation_id=eq.${conversationId}` },
    ];
    for (const { table, filter } of tables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
        (change) => {
          if (table === "messages" && change.eventType === "INSERT") {
            const row = change.new as { created_at?: string };
            if (row.created_at) timingArrival(row.created_at);
          }
          fire();
        },
      );
    }
    channel.on("broadcast", { event: "*" }, (message) => {
      const payload = (message.payload ?? {}) as Record<string, unknown>;
      set.broadcast.forEach((cb) => cb(message.event, payload));
    });
    channel.subscribe();
    entry = { channel, handlers: set, refs: 0 };
    entries.set(conversationId, entry);
  }
  const current = entry;
  current.refs += 1;
  if (handlers.onChange) current.handlers.change.add(handlers.onChange);
  if (handlers.onBroadcast) current.handlers.broadcast.add(handlers.onBroadcast);
  let released = false;
  return {
    send: (event, payload) => {
      void current.channel.send({ type: "broadcast", event, payload });
    },
    release: () => {
      if (released) return;
      released = true;
      if (handlers.onChange) current.handlers.change.delete(handlers.onChange);
      if (handlers.onBroadcast) current.handlers.broadcast.delete(handlers.onBroadcast);
      current.refs -= 1;
      if (current.refs === 0) {
        entries.delete(conversationId);
        void supabase.removeChannel(current.channel);
      }
    },
  };
}
