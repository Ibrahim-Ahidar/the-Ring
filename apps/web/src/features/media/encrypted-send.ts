import type { MediaBody } from "@pulse/core/e2ee/plain-envelope";
import { err, ok, type Result } from "@pulse/core/result";

import { getTextOutbox, type TextOutbox } from "@/features/direct-messaging/lib/text-outbox";

import { getCurrentUserId, uploadWithGrant } from "./encrypted-media-runtime";
import { readImageDimensions } from "./image-dimensions";

export type EncryptedSendDeps = {
  getUserId(): Promise<string | null>;
  upload(input: {
    conversationId: string;
    bytes: Uint8Array;
    mimeType: string;
    fileName: string;
    width: number | null;
    height: number | null;
    durationMs: number | null;
  }): Promise<Result<MediaBody>>;
  getOutbox(userId: string): Promise<TextOutbox | null>;
  readDimensions(file: File): Promise<{ width: number; height: number } | null>;
  now(): string;
};

export const defaultEncryptedSendDeps: EncryptedSendDeps = {
  getUserId: getCurrentUserId,
  upload: uploadWithGrant,
  getOutbox: getTextOutbox,
  readDimensions: readImageDimensions,
  now: () => new Date().toISOString(),
};

/**
 * e2ee flag on: encrypts the attachment, uploads only ciphertext, then sends the media envelope
 * through the same outbox as encrypted text (Olm for 1:1, Megolm for groups), so retry and
 * idempotency are shared. The timeline shows the message when the outbox reports it sent.
 */
export async function sendEncryptedMedia(
  input: { conversationId: string; clientId: string; file: File; durationMs?: number | null },
  deps: EncryptedSendDeps = defaultEncryptedSendDeps,
): Promise<Result<void>> {
  const userId = await deps.getUserId();
  if (!userId) return err("platform.unauthenticated");
  const box = await deps.getOutbox(userId);
  if (!box) return err("e2ee.runtime_unavailable");

  const dims = input.file.type.startsWith("image/") ? await deps.readDimensions(input.file) : null;
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const uploaded = await deps.upload({
    conversationId: input.conversationId,
    bytes,
    mimeType: input.file.type,
    fileName: input.file.name,
    width: dims?.width ?? null,
    height: dims?.height ?? null,
    durationMs: input.durationMs ?? null,
  });
  if (!uploaded.ok) return uploaded;

  const queued = await box.enqueueText(
    { conversationId: input.conversationId, clientId: input.clientId, body: "", media: uploaded.value },
    deps.now(),
  );
  return queued ? ok(undefined) : err("e2ee.enqueue_failed");
}
