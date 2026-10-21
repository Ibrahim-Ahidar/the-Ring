/**
 * Perf tracing, off unless PULSE_PERF_TRACE=1. Logs every outgoing HTTP request
 * the Node server makes (Supabase Auth, PostgREST RPCs) with start time and
 * duration, so the serial server waterfall of a navigation can be read from the
 * server log. Uses undici's diagnostics channels, so it sees requests no matter
 * how `fetch` is wrapped.
 */
import diagnostics from "node:diagnostics_channel";

type UndiciRequest = { origin?: string; method?: string; path?: string };

export function perfTraceEnabled(): boolean {
  return process.env.PULSE_PERF_TRACE === "1";
}

export function perfLog(label: string, startedAt: number, extra = ""): void {
  if (!perfTraceEnabled()) {
    return;
  }
  const now = performance.timeOrigin + performance.now();
  console.log(
    `[perf] t=${startedAt.toFixed(0)} dur=${(now - startedAt).toFixed(0)}ms ${label}${extra ? ` ${extra}` : ""}`,
  );
}

function shortPath(path: string | undefined): string {
  if (!path) {
    return "?";
  }
  const [base] = path.split("?");
  return base;
}

let started = false;

export function startFetchTrace(): void {
  if (started) {
    return;
  }
  started = true;
  const starts = new WeakMap<object, number>();
  diagnostics.channel("undici:request:create").subscribe((message) => {
    const { request } = message as { request: object };
    starts.set(request, performance.timeOrigin + performance.now());
  });
  diagnostics.channel("undici:request:headers").subscribe((message) => {
    const { request, response } = message as {
      request: UndiciRequest & object;
      response: { statusCode?: number };
    };
    const startedAt = starts.get(request);
    if (startedAt === undefined) {
      return;
    }
    perfLog(
      `fetch ${request.method ?? "GET"} ${shortPath(request.path)}`,
      startedAt,
      `status=${response.statusCode ?? "?"}`,
    );
  });
}
