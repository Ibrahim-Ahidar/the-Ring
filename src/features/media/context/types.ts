import type { LocalUploadState } from "../types";

export type MediaState = {
  uploadsByClientId: Record<string, LocalUploadState>;
};

export type MediaAction =
  | { type: "upload/set"; upload: LocalUploadState }
  | { type: "upload/patch"; clientId: string; patch: Partial<LocalUploadState> }
  | { type: "upload/remove"; clientId: string };
