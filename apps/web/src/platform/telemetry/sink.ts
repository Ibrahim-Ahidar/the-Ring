import type { SafeErrorPayload } from "./scrub";

export type TelemetrySink = {
  captureError?(
    error: SafeErrorPayload,
    context: Record<string, unknown>,
  ): void | Promise<void>;
  captureEvent?(
    name: string,
    properties: Record<string, unknown>,
  ): void | Promise<void>;
};

const noop = (): void => {};

export const noopTelemetrySink: TelemetrySink = {
  captureError: noop,
  captureEvent: noop,
};

/** Optional {@link https://docs.sentry.io/product/sentry-basics/dsn-explainer/ | Sentry DSN}; when unset, telemetry calls no-op unless a sink is injected. */
export function isTelemetryEnabledByEnv(): boolean {
  const dsn = process.env.SENTRY_DSN;
  return typeof dsn === "string" && dsn.trim().length > 0;
}

export function createDevelopmentConsoleSink(): TelemetrySink {
  return {
    captureError(error, context) {
      console.error("[telemetry:error]", error, context);
    },
    captureEvent(name, properties) {
      console.info("[telemetry:event]", name, properties);
    },
  };
}
