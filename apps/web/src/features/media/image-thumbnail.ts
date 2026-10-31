/** Raw JPEG budget: ciphertext adds overhead and base64 adds a third, and the envelope caps the field at 16384 chars. */
export const MAX_THUMB_BYTES = 10_000;
const EDGES = [96, 72, 48];

/**
 * Small JPEG preview of an image, made locally in a canvas. It is only ever encrypted with the
 * file key and carried inside the envelope; it is never uploaded or logged in the clear.
 * Returns null when it cannot be made or does not fit the budget.
 */
export function makeImageThumbnail(file: File): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/") || typeof document === "undefined") return resolve(null);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.onload = async () => {
      URL.revokeObjectURL(url);
      try {
        for (const edge of EDGES) {
          const scale = Math.min(1, edge / Math.max(img.naturalWidth, img.naturalHeight));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
          canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.6));
          if (!blob) return resolve(null);
          if (blob.size <= MAX_THUMB_BYTES) return resolve(new Uint8Array(await blob.arrayBuffer()));
        }
        resolve(null);
      } catch {
        resolve(null);
      }
    };
    img.src = url;
  });
}
