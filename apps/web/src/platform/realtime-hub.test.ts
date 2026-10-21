import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: "jwt-1" } },
      })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
    realtime: { setAuth: vi.fn(async () => undefined) },
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

async function settle() {
  await vi.advanceTimersByTimeAsync(5);
}

describe("realtime hub", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shares one subscription per topic and removes it after the last leave", async () => {
    const fake = fakeSupabase();
    const a = joinConversation(fake.supabase, "c1", "u1");
    const b = joinConversation(fake.supabase, "c1", "u1");
    await settle();

    expect(fake.raw.channel).toHaveBeenCalledTimes(1);
    expect(fake.raw.channel).toHaveBeenCalledWith("conversation:c1", expect.anything());
    expect(fake.channel.subscribe).toHaveBeenCalledTimes(1);

    a.leave();
    a.leave();
    await settle();
    expect(fake.raw.removeChannel).not.toHaveBeenCalled();
    b.leave();
    expect(fake.raw.removeChannel).not.toHaveBeenCalled();
    await settle();
    expect(fake.raw.removeChannel).toHaveBeenCalledTimes(1);
  });

  it("fans out broadcasts and row changes, and stops after leave", async () => {
    const fake = fakeSupabase();
    const a = joinConversation(fake.supabase, "c2", "u1");
    const b = joinConversation(fake.supabase, "c2", "u1");
    await settle();
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

  it("replays the last status to late listeners", async () => {
    const fake = fakeSupabase();
    const handle = joinConversation(fake.supabase, "c3", "u1");
    const onStatus = vi.fn();
    await settle();
    handle.onStatus(onStatus);
    expect(onStatus).toHaveBeenCalledWith("SUBSCRIBED");
    handle.leave();
  });

  it("subscribes to message row updates and caller message hides", async () => {
    const fake = fakeSupabase();
    joinConversation(fake.supabase, "c4", "u1");
    await settle();
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

  it("reuses the live channel when a leave is followed by an immediate re-join", async () => {
    const fake = fakeSupabase();
    const first = joinConversation(fake.supabase, "c5", "u1");
    await settle();
    first.leave();
    const second = joinConversation(fake.supabase, "c5", "u1");
    await settle();
    expect(fake.raw.removeChannel).not.toHaveBeenCalled();
    expect(fake.raw.channel).toHaveBeenCalledTimes(1);

    const onChange = vi.fn();
    second.onChange(onChange);
    fake.emit("postgres_changes", { eventType: "INSERT", new: { id: "m" }, old: {} });
    expect(onChange).toHaveBeenCalled();
    second.leave();
  });

  it("waits for an in-flight removal before creating a new channel", async () => {
    const fake = fakeSupabase();
    let finish: () => void = () => {};
    fake.raw.removeChannel.mockImplementationOnce(
      () => new Promise<string>((resolve) => (finish = () => resolve("ok"))),
    );
    const first = joinConversation(fake.supabase, "c6", "u1");
    await settle();
    first.leave();
    await settle();
    expect(fake.raw.removeChannel).toHaveBeenCalledTimes(1);

    const second = joinConversation(fake.supabase, "c6", "u1");
    await settle();
    expect(fake.raw.channel).toHaveBeenCalledTimes(1);
    finish();
    await settle();
    expect(fake.raw.channel).toHaveBeenCalledTimes(2);
    expect(fake.channel.subscribe).toHaveBeenCalledTimes(2);
    second.leave();
  });

  it("gives the realtime socket the session JWT before subscribing", async () => {
    const fake = fakeSupabase();
    joinConversation(fake.supabase, "c7", "u1");
    await settle();
    expect(fake.raw.realtime.setAuth).toHaveBeenCalledWith("jwt-1");
    const authOrder = fake.raw.realtime.setAuth.mock.invocationCallOrder[0];
    expect(authOrder).toBeLessThan(fake.channel.subscribe.mock.invocationCallOrder[0]);
  });
});
