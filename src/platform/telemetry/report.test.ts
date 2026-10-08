import { afterEach, describe, expect, it, vi } from "vitest";

import { PORTFOLIO_EVENT_NAMES } from "./events";
import { reportError, reportEvent, setTelemetrySink } from "./report";
import type { TelemetrySink } from "./sink";

const originalDsn = process.env.SENTRY_DSN;

afterEach(() => {
  setTelemetrySink(null);
  if (originalDsn === undefined) {
    delete process.env.SENTRY_DSN;
  } else {
    process.env.SENTRY_DSN = originalDsn;
  }
});

describe("reportError / reportEvent without DSN", () => {
  it("reportError resolves and does not throw", async () => {
    delete process.env.SENTRY_DSN;
    await expect(
      reportError(new Error("should not leak"), { body: "x" }),
    ).resolves.toBeUndefined();
  });

  it("reportEvent resolves and does not throw", async () => {
    delete process.env.SENTRY_DSN;
    await expect(
      reportEvent("app.error", { code: "x" }),
    ).resolves.toBeUndefined();
  });
});

describe("injected sink", () => {
  it("drops forbidden event properties before the sink", async () => {
    const captureEvent = vi.fn();
    setTelemetrySink({ captureEvent });

    await reportEvent("message_sent", {
      body: "hello",
      text: "draft",
      bio: "about me",
      details: "report reason",
      messageId: "m1",
    });

    expect(captureEvent).toHaveBeenCalledOnce();
    expect(captureEvent).toHaveBeenCalledWith("message_sent", {
      messageId: "m1",
    });
  });

  it("passes allowed properties through to the sink", async () => {
    const captureEvent = vi.fn();
    setTelemetrySink({ captureEvent });

    await reportEvent("search_used", {
      code: "search.ok",
      durationMs: 40,
      userId: "u1",
    });

    expect(captureEvent).toHaveBeenCalledWith("search_used", {
      code: "search.ok",
      durationMs: 40,
      userId: "u1",
    });
  });

  it.each(PORTFOLIO_EVENT_NAMES)("accepts portfolio event %s", async (name) => {
    const captureEvent = vi.fn();
    setTelemetrySink({ captureEvent });

    await reportEvent(name, { code: "ok" });

    expect(captureEvent).toHaveBeenCalledWith(name, { code: "ok" });
  });

  it("accepts app.error event name", async () => {
    const captureEvent = vi.fn();
    setTelemetrySink({ captureEvent });
    await reportEvent("app.error", { code: "platform.unexpected" });
    expect(captureEvent).toHaveBeenCalledWith("app.error", {
      code: "platform.unexpected",
    });
  });

  it("never forwards error message text or forbidden context", async () => {
    const captureError = vi.fn();
    setTelemetrySink({ captureError });

    await reportError(new Error("user typed this body"), {
      text: "also forbidden",
      nested: { bio: "hidden", code: "identity.failed" },
    });

    expect(captureError).toHaveBeenCalledOnce();
    const [errorArg, contextArg] = captureError.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(errorArg).not.toHaveProperty("message");
    expect(JSON.stringify(errorArg)).not.toContain("user typed");
    expect(contextArg).toEqual({ nested: { code: "identity.failed" } });
  });

  it("does not throw when the sink throws", async () => {
    const failingSink: TelemetrySink = {
      captureEvent() {
        throw new Error("sink broken");
      },
      captureError() {
        throw new Error("sink broken");
      },
    };
    setTelemetrySink(failingSink);

    await expect(reportEvent("app.error", { code: "x" })).resolves.toBeUndefined();
    await expect(
      reportError(new Error("x"), { code: "y" }),
    ).resolves.toBeUndefined();
  });

  it("does not throw when the sink returns a rejected promise", async () => {
    setTelemetrySink({
      captureEvent: async () => {
        throw new Error("async sink broken");
      },
    });

    await expect(reportEvent("language_changed", { code: "x" })).resolves.toBeUndefined();
  });
});
