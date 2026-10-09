import { describe, expect, it, vi } from "vitest";

import type { RpcClient } from "@/platform/rpc";

import { ok } from "@/platform/result";

import { completeUploadFlow } from "./complete-upload-flow";

const markVerified = async () => ok(undefined);

const attachmentRow = {
  id: "a1",
  message_id: "m1",
  storage_path: "c1/obj",
  mime_type: "image/png",
  size_bytes: 100,
  file_name: null,
  width: null,
  height: null,
  duration_ms: null,
  waveform: null,
  created_at: new Date().toISOString(),
};

function rpcWithAttachments(
  handlers: Partial<Record<string, () => unknown>>,
): RpcClient {
  return {
    async rpc(fn: string, args?: Record<string, unknown>) {
      if (fn === "get_message_attachments") {
        return { data: [attachmentRow], error: null };
      }
      if (fn === "complete_upload") {
        handlers.complete_upload?.();
        expect(args?.p_object_size_bytes).toBe(100);
        return {
          data: [
            {
              id: "m1",
              conversation_id: "c1",
              sender_id: "u1",
              client_id: "cl1",
              type: "image",
              body: "x",
              reply_to_id: null,
              created_at: new Date().toISOString(),
              edited_at: null,
              deleted_at: null,
              deletion_scope: "none",
              pinned_at: null,
              forwarded: false,
              metadata: { upload: "ready" },
            },
          ],
          error: null,
        };
      }
      return { data: null, error: { message: "unexpected" } };
    },
  };
}

describe("completeUploadFlow", () => {
  it("returns media.rejected when the storage object is missing", async () => {
    const verify = vi.fn(async () => null);
    const result = await completeUploadFlow(rpcWithAttachments({}), verify, markVerified, {
      messageId: "m1",
    });
    expect(result).toEqual({ ok: false, error: { code: "media.rejected" } });
    expect(verify).toHaveBeenCalledWith("c1/obj");
  });

  it("returns media.rejected when object size mismatches prepared size_bytes", async () => {
    const verify = vi.fn(async () => 50);
    const result = await completeUploadFlow(rpcWithAttachments({}), verify, markVerified, {
      messageId: "m1",
    });
    expect(result).toEqual({ ok: false, error: { code: "media.rejected" } });
  });

  it("calls complete_upload when object size matches", async () => {
    const complete = vi.fn();
    const result = await completeUploadFlow(
      rpcWithAttachments({ complete_upload: complete }),
      async () => 100,
      markVerified,
      { messageId: "m1" },
    );
    expect(result.ok).toBe(true);
    expect(complete).toHaveBeenCalled();
  });
});
