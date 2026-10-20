import { scrubProperties, toSafeErrorPayload } from "./scrub";
import {
  createDevelopmentConsoleSink,
  isTelemetryEnabledByEnv,
  noopTelemetrySink,
  type TelemetrySink,
} from "./sink";

let injectedSink: TelemetrySink | null = null;

/**
 * Replace the active telemetry sink (for tests or future SDK wiring).
 * Pass `null` to clear the override.
 */
export function setTelemetrySink(sink: TelemetrySink | null): void {
  injectedSink = sink;
}

function resolveSink(): TelemetrySink {
  if (injectedSink !== null) {
    return injectedSink;
  }
  if (!isTelemetryEnabledByEnv()) {
    return noopTelemetrySink;
  }
  if (process.env.NODE_ENV === "development") {
    return createDevelopmentConsoleSink();
  }
  return noopTelemetrySink;
}

function shouldDeliver(): boolean {
  if (injectedSink !== null) {
    return true;
  }
  return isTelemetryEnabledByEnv();
}

async function runSinkSafely(task: () => void | Promise<void>): Promise<void> {
  try {
    await task();
  } catch {
    // Sink failures must not affect callers.
  }
}

/**
 * Report an unexpected error. Context is scrubbed; error message text is never sent.
 * No-ops when {@link process.env.SENTRY_DSN | SENTRY_DSN} is unset and no sink is injected.
 */
export async function reportError(
  error: unknown,
  context?: Record<string, unknown>,
): Promise<void> {
  if (!shouldDeliver()) {
    return;
  }
  const sink = resolveSink();
  const safeError = toSafeErrorPayload(error);
  const safeContext = scrubProperties(context);
  await runSinkSafely(async () => {
    await sink.captureError?.(safeError, safeContext);
  });
}

/**
 * Report a product telemetry event. Forbidden property keys are dropped before the sink.
 * No-ops when {@link process.env.SENTRY_DSN | SENTRY_DSN} is unset and no sink is injected.
 */
export async function reportEvent(
  name: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  if (!shouldDeliver()) {
    return;
  }
  const sink = resolveSink();
  const safeProperties = scrubProperties(properties);
  await runSinkSafely(async () => {
    await sink.captureEvent?.(name, safeProperties);
  });
}
