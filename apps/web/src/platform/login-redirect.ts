export const LOGIN_REASONS = [
  "identity.session_revoked",
  "identity.confirmation_required",
  "link_invalid",
  "link_expired",
  "signed_out",
] as const;

export type LoginReason = (typeof LOGIN_REASONS)[number];

export function parseLoginReason(raw: string | null | undefined): LoginReason | null {
  return LOGIN_REASONS.find((reason) => reason === raw) ?? null;
}

const PROBE_ORIGIN = "http://pulse.invalid";
const AUTH_PAGES = ["/login", "/signup"];

/**
 * A same-origin path to continue to after sign-in, or `fallback`.
 * Resolving against a fixed origin catches `//host`, `/\host`, and the
 * tab/newline stripping the URL parser does before treating input as relative.
 */
export function safeNextPath(raw: string | null | undefined, fallback: string): string {
  if (!raw || !raw.startsWith("/")) {
    return fallback;
  }
  let url: URL;
  try {
    url = new URL(raw, PROBE_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PROBE_ORIGIN) {
    return fallback;
  }
  if (AUTH_PAGES.some((page) => url.pathname === page || url.pathname.startsWith(`${page}/`))) {
    return fallback;
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function loginPath(params: { reason?: LoginReason; next?: string } = {}): string {
  const search = new URLSearchParams();
  if (params.reason) {
    search.set("reason", params.reason);
  }
  if (params.next) {
    search.set("next", params.next);
  }
  const query = search.toString();
  return query ? `/login?${query}` : "/login";
}
