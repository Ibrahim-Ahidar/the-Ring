"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";

import { emitMessageMutation } from "@/features/message-actions/message-actions-events";

import { validateAttachment } from "@/platform/media";
import type { AttachmentKind } from "@/platform/media";
import { isE2eeEnabled } from "@pulse/core/e2ee-flag";
import { randomUUID } from "@pulse/core/uuid";

import {
  completeUploadAction,
  failUploadAction,
  prepareUploadAction,
} from "../actions";
import { sendEncryptedMedia } from "../encrypted-send";
import { readImageDimensions } from "../image-dimensions";
import { uploadToSignedTarget } from "../upload-client";
import { computeWaveform } from "../waveform";
import { createInitialMediaState, mediaReducer } from "./reducer";
import type { MediaState } from "./types";

type StartUploadInput = {
  conversationId: string;
  file: File;
  clientId?: string;
  durationMs?: number;
};

type MediaContextValue = {
  state: MediaState;
  startUpload: (input: StartUploadInput) => Promise<void>;
  retryUpload: (clientId: string) => Promise<void>;
  cancelUpload: (clientId: string) => void;
  getUpload: (clientId: string) => MediaState["uploadsByClientId"][string] | undefined;
};

const MediaContext = createContext<MediaContextValue | null>(null);

export function useMedia(): MediaContextValue {
  const ctx = useContext(MediaContext);
  if (!ctx) {
    throw new Error("useMedia requires MediaProvider");
  }
  return ctx;
}

export function MediaProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(mediaReducer, undefined, createInitialMediaState);
  const filesByClientId = useRef(new Map<string, File>());

  const runPipeline = useCallback(
    async (input: {
      conversationId: string;
      file: File;
      clientId: string;
      kind: AttachmentKind;
      durationMs?: number;
    }) => {
      const previewUrl =
        input.kind === "image" ? URL.createObjectURL(input.file) : null;

      dispatch({
        type: "upload/set",
        upload: {
          clientId: input.clientId,
          conversationId: input.conversationId,
          messageId: null,
          kind: input.kind,
          fileName: input.file.name,
          mimeType: input.file.type,
          sizeBytes: input.file.size,
          previewUrl,
          progress: 0,
          status: "preparing",
          errorCode: null,
        },
      });

      // e2ee flag on: encrypt, upload ciphertext to R2 and send a media envelope (no legacy storage).
      if (isE2eeEnabled()) {
        dispatch({ type: "upload/patch", clientId: input.clientId, patch: { status: "uploading", progress: 0.35 } });
        const sent = await sendEncryptedMedia({
          conversationId: input.conversationId,
          clientId: input.clientId,
          file: input.file,
          durationMs: input.durationMs,
        });
        if (!sent.ok) {
          dispatch({
            type: "upload/patch",
            clientId: input.clientId,
            patch: { status: "failed", errorCode: sent.error.code },
          });
          return;
        }
        filesByClientId.current.delete(input.clientId);
        dispatch({ type: "upload/remove", clientId: input.clientId });
        return;
      }

      const prepared = await prepareUploadAction({
        conversationId: input.conversationId,
        clientId: input.clientId,
        mimeType: input.file.type,
        sizeBytes: input.file.size,
        fileName: input.file.name,
        durationMs: input.durationMs ?? null,
      });

      if (!prepared.ok) {
        dispatch({
          type: "upload/patch",
          clientId: input.clientId,
          patch: { status: "failed", errorCode: prepared.error.code },
        });
        return;
      }

      emitMessageMutation({
        kind: "upsert",
        conversationId: input.conversationId,
        message: {
          id: prepared.value.messageId,
          conversation_id: input.conversationId,
          sender_id: prepared.value.messageId,
          client_id: input.clientId,
          type: prepared.value.messageType,
          body: input.file.name,
          reply_to_id: null,
          created_at: new Date().toISOString(),
          edited_at: null,
          deleted_at: null,
          deletion_scope: "none",
          pinned_at: null,
          forwarded: false,
          metadata: { upload: "pending" },
        },
      });

      dispatch({
        type: "upload/patch",
        clientId: input.clientId,
        patch: {
          messageId: prepared.value.messageId,
          status: "uploading",
        },
      });

      const uploaded = await uploadToSignedTarget({
        storagePath: prepared.value.storagePath,
        token: prepared.value.token,
        file: input.file,
        onProgress: (ratio) => {
          dispatch({
            type: "upload/patch",
            clientId: input.clientId,
            patch: { progress: ratio },
          });
        },
      });

      if (!uploaded.ok) {
        await failUploadAction({ messageId: prepared.value.messageId });
        dispatch({
          type: "upload/patch",
          clientId: input.clientId,
          patch: { status: "failed", errorCode: uploaded.code },
        });
        return;
      }

      dispatch({
        type: "upload/patch",
        clientId: input.clientId,
        patch: { status: "completing", progress: 1 },
      });

      const dimensions =
        input.kind === "image" ? await readImageDimensions(input.file) : null;
      const waveform =
        input.kind === "audio" ? await computeWaveform(input.file) : null;

      const completed = await completeUploadAction({
        messageId: prepared.value.messageId,
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
        waveform,
      });

      if (!completed.ok) {
        await failUploadAction({ messageId: prepared.value.messageId });
        dispatch({
          type: "upload/patch",
          clientId: input.clientId,
          patch: { status: "failed", errorCode: completed.error.code },
        });
        return;
      }

      filesByClientId.current.delete(input.clientId);
      dispatch({ type: "upload/remove", clientId: input.clientId });
      emitMessageMutation({
        kind: "upsert",
        conversationId: input.conversationId,
        message: completed.value,
      });
    },
    [],
  );

  const startUpload = useCallback(
    async (input: StartUploadInput) => {
      const clientId = input.clientId ?? randomUUID();
      const validated = validateAttachment({
        mimeType: input.file.type,
        sizeBytes: input.file.size,
        durationMs: input.durationMs,
      });
      if (!validated.ok) {
        dispatch({
          type: "upload/set",
          upload: {
            clientId,
            conversationId: input.conversationId,
            messageId: null,
            kind: "file",
            fileName: input.file.name,
            mimeType: input.file.type,
            sizeBytes: input.file.size,
            previewUrl: null,
            progress: 0,
            status: "failed",
            errorCode: validated.error.code,
          },
        });
        return;
      }
      filesByClientId.current.set(clientId, input.file);
      await runPipeline({
        conversationId: input.conversationId,
        file: input.file,
        clientId,
        kind: validated.value.kind,
        durationMs: input.durationMs,
      });
    },
    [runPipeline],
  );

  const retryUpload = useCallback(
    async (clientId: string) => {
      const entry = state.uploadsByClientId[clientId];
      const file = filesByClientId.current.get(clientId);
      if (!entry || !file) {
        return;
      }
      await runPipeline({
        conversationId: entry.conversationId,
        file,
        clientId,
        kind: entry.kind,
      });
    },
    [runPipeline, state.uploadsByClientId],
  );

  const cancelUpload = useCallback((clientId: string) => {
    filesByClientId.current.delete(clientId);
    dispatch({ type: "upload/remove", clientId: clientId });
  }, []);

  const getUpload = useCallback(
    (clientId: string) => state.uploadsByClientId[clientId],
    [state.uploadsByClientId],
  );

  const value = useMemo(
    () => ({
      state,
      startUpload,
      retryUpload,
      cancelUpload,
      getUpload,
    }),
    [cancelUpload, getUpload, retryUpload, startUpload, state],
  );

  return <MediaContext.Provider value={value}>{children}</MediaContext.Provider>;
}
