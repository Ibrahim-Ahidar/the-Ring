import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { joinConversation } from "./realtime-hub";

type Handler = (payload: Record<string, unknown>) => void;

function fakeSupabase() {
  const handlers: Array<{ type: string; filter: Record<string, unknown>; cb: Handler }> = [];
  const channel = {
    on: vi.fn((type: string, filter: Record<string, unknown>, cb: Handler) => {
      handlers.push({ type, filter, cb });
      return channel;
    }),
    subscribe: vi.fn((cb: (status: string) => void) => {
      cb("SUBSCRIBED");
      return channel;
    }),
    send: vi.fn(async () => "ok"),
    track: vi.fn(async () => "ok"),
    untrack: vi.fn(async () => "ok"),
    presenceState: vi.fn(() => ({ u1: [{ online: true }] })),
  };
  const supabase = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(async () => "ok"),
  };
  return {
    supabase: supabase as unknown as SupabaseClient,
    raw: supabase,
    channel,
    emit(type: string, payload: Record<string, unknown>) {
      handlers.filter((h) => h.type === type).forEach((h) => h.cb(payload));
    },
  };
}

describe("realtime hub", () => {
  it("shares one subscription per topic and removes it after the last leave", () => {
    const fake = fakeSupabase();
    const a = joinConversation(fake.supabase, "c1", "u1");
    const b = joinConversation(fake.supabase, "c1", "u1");

    expect(fake.raw.channel).toHaveBeenCalledTimes(1);
    expect(fake.raw.channel).toHaveBeenCalledWith("conversation:c1", expect.anything());
    expect(fake.channel.subscribe).toHaveBeenCalledTimes(1);

    a.leave();
    a.leave();
    expect(fake.raw.removeChannel).not.toHaveBeenCalled();
    b.leave();
    expect(fake.raw.removeChannel).toHaveBeenCalledTimes(1);
  });

  it("fans out broadcasts and row changes, and stops after leave", () => {
    const fake = fakeSupabase();
    const a = joinConversation(fake.supabase, "c2", "u1");
    const b = joinConversation(fake.supabase, "c2", "u1");
    const onA = vi.fn();
    const onB = vi.fn();
    const onChange = vi.fn();
    a.onBroadcast(onA);
    b.onBroadcast(onB);
    b.onChange(onChange);

    fake.emit("broadcast", { event: "typing.started", payload: { userId: "u2" } });
    expect(onA).toHaveBeenCalledWith("typing.started", { userId: "u2" });
    expect(onB).toHaveBeenCalledTimes(1);

    fake.emit("postgres_changes", { eventType: "INSERT", new: { id: "m1" }, old: {} });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "INSERT", new: { id: "m1" } }),
    );

    a.leave();
    fake.emit("broadcast", { event: "typing.stopped", payload: {} });
    expect(onA).toHaveBeenCalledTimes(1);
    expect(onB).toHaveBeenCalledTimes(2);
    b.leave();
  });

  it("replays the last status to late listeners", () => {
    const fake = fakeSupabase();
    const handle = joinConversation(fake.supabase, "c3", "u1");
    const onStatus = vi.fn();
    handle.onStatus(onStatus);
    expect(onStatus).toHaveBeenCalledWith("SUBSCRIBED");
    handle.leave();
  });

  it("subscribes to message row updates and caller message hides", () => {
    const fake = fakeSupabase();
    joinConversation(fake.supabase, "c4", "u1");
    const postgres = fake.channel.on.mock.calls.filter(
      (call) => call[0] === "postgres_changes",
    );
    const tables = postgres.map(
      (call) => (call[1] as { table: string }).table,
    );
    expect(tables).toEqual(
      expect.arrayContaining([
        "messages",
        "message_reactions",
        "conversation_members",
        "message_hides",
      ]),
    );
    const hideSub = postgres.find(
      (call) => (call[1] as { table: string }).table === "message_hides",
    );
    expect(hideSub?.[1]).toMatchObject({ event: "*", filter: "user_id=eq.u1" });
  });
});
