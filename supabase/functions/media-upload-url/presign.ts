// AWS Signature V4 query-string presigning for Cloudflare R2 (S3 API), with WebCrypto HMAC.
// This is request signing, not message encryption; no custom cipher is involved.
export type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string };

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
const uriEncode = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(data));
}

export type PresignInput = {
  method: "PUT" | "GET";
  /** Object key, without the bucket. */
  key: string;
  expiresSec: number;
  now: Date;
  /** Extra headers to sign (lowercase names), e.g. content-length for PUT. */
  signedHeaders?: Record<string, string>;
  /** Overrides for tests against published vectors. */
  host?: string;
  region?: string;
  /** Path-style puts the bucket in the path (R2); false puts the key at the root (vector tests). */
  pathStyle?: boolean;
};

export async function presignUrl(cfg: R2Config, i: PresignInput): Promise<string> {
  const host = i.host ?? `${cfg.accountId}.r2.cloudflarestorage.com`;
  const region = i.region ?? "auto";
  const iso = i.now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const date = iso.slice(0, 8);
  const scope = `${date}/${region}/s3/aws4_request`;
  const headers: Record<string, string> = { host, ...(i.signedHeaders ?? {}) };
  const names = Object.keys(headers).sort();
  const path = "/" + ((i.pathStyle ?? true) ? `${cfg.bucket}/` : "") + i.key.split("/").map(uriEncode).join("/");
  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${cfg.accessKeyId}/${scope}`,
    "X-Amz-Date": iso,
    "X-Amz-Expires": String(i.expiresSec),
    "X-Amz-SignedHeaders": names.join(";"),
  };
  const canonQuery = Object.keys(query)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(query[k])}`)
    .join("&");
  const canonical = [
    i.method,
    path,
    canonQuery,
    names.map((n) => `${n}:${headers[n].trim()}\n`).join(""),
    names.join(";"),
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const toSign = [
    "AWS4-HMAC-SHA256",
    iso,
    scope,
    hex(await crypto.subtle.digest("SHA-256", enc.encode(canonical))),
  ].join("\n");
  let k = await hmac(enc.encode("AWS4" + cfg.secretAccessKey), date);
  k = await hmac(k, region);
  k = await hmac(k, "s3");
  k = await hmac(k, "aws4_request");
  const sig = hex(await hmac(k, toSign));
  return `https://${host}${path}?${canonQuery}&X-Amz-Signature=${sig}`;
}
