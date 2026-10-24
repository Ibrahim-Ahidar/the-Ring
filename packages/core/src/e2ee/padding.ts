/**
 * Plaintext padding (spec 6.2): the Olm plaintext is a JSON document, padded with trailing
 * spaces so its UTF-8 length is a multiple of 256 bytes. JSON ignores trailing whitespace,
 * so no marker or unpadding step is needed, and the server only learns the size bucket.
 */
export const PAD_BLOCK = 256;

const enc = new TextEncoder();

export function padPlaintext(json: string): string {
  const len = enc.encode(json).length;
  const target = Math.max(PAD_BLOCK, Math.ceil(len / PAD_BLOCK) * PAD_BLOCK);
  return json + " ".repeat(target - len);
}
