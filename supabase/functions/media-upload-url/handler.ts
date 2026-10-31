// media-upload-url (issue #230, spec section 9). Hands out 5-minute pre-signed R2 links for
// end-to-end encrypted media. The function never sees keys or plaintext: it checks the size
// limits and conversation membership, signs the exact object size into the PUT, and signs GET
// links for members. Dependencies are injected so the logic is testable without Deno or R2.
import { presignUrl, type R2Config } from "./presign.ts";
import { validateUpload } from "./policy.ts";

export const URL_TTL_SEC = 300;

export type Deps = {
  /** null when the R2_* secrets are not set. */
  r2: R2Config | null;
  now(): Date;
  newId(): string;
  /** Verifies the caller's JWT; null when invalid. */
  authenticate(authorization: string): Promise<{ userId: string } | null>;
  /** True when the caller is an active member of the conversation (checked as the caller). */
  isMember(authorization: string, conversationId: string): Promise<boolean>;
};

const json = (body: unknown, status = 200) => Response.json(body, { status });
const fail = (code: string, status = 400) => json({ ok: false, error: { code } }, status);
const str = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= 200 ? v : null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_ID = /^[A-Za-z0-9-]{8,64}$/;

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== "POST") return fail("platform.method_not_allowed", 405);
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return fail("platform.unauthenticated", 401);
  if (!(await deps.authenticate(auth))) return fail("platform.unauthenticated", 401);

  let b: Record<string, unknown>;
  try {
    b = (await req.json()) as Record<string, unknown>;
  } catch {
    return fail("platform.bad_request");
  }
  const conversationId = str(b.conversationId);
  if (!conversationId || !UUID.test(conversationId)) return fail("platform.bad_request");
  const action = b.action ?? "upload";

  if (action === "upload") {
    const mime = str(b.mimeType);
    const size = b.sizeBytes;
    const duration = typeof b.durationMs === "number" ? b.durationMs : null;
    if (!mime || typeof size !== "number") return fail("platform.bad_request");
    const invalid = validateUpload(mime, size, duration);
    if (invalid) return fail(invalid);
    if (!(await deps.isMember(auth, conversationId))) return fail("media.rejected", 403);
    if (!deps.r2) return fail("media.not_configured", 503);
    const key = `media/${conversationId}/${deps.newId()}`;
    // content-length is signed, so R2 refuses a body of any other size.
    const url = await presignUrl(deps.r2, {
      method: "PUT",
      key,
      expiresSec: URL_TTL_SEC,
      now: deps.now(),
      signedHeaders: { "content-length": String(size) },
    });
    return json({ ok: true, value: { url, key, expiresInSec: URL_TTL_SEC, headers: {} } });
  }

  if (action === "download") {
    const key = str(b.key);
    // The key must live under this conversation's prefix: membership of one chat never opens another.
    const m = key ? /^media\/([^/]+)\/([^/]+)$/.exec(key) : null;
    if (!key || !m || m[1] !== conversationId || !SAFE_ID.test(m[2])) return fail("platform.bad_request");
    if (!(await deps.isMember(auth, conversationId))) return fail("media.rejected", 403);
    if (!deps.r2) return fail("media.not_configured", 503);
    const url = await presignUrl(deps.r2, { method: "GET", key, expiresSec: URL_TTL_SEC, now: deps.now() });
    return json({ ok: true, value: { url, expiresInSec: URL_TTL_SEC } });
  }

  return fail("platform.bad_request");
}
