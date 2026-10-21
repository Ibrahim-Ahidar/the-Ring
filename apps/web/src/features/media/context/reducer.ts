import type { MediaAction, MediaState } from "./types";

export function createInitialMediaState(): MediaState {
  return { uploadsByClientId: {} };
}

export function mediaReducer(state: MediaState, action: MediaAction): MediaState {
  switch (action.type) {
    case "upload/set":
      return {
        ...state,
        uploadsByClientId: {
          ...state.uploadsByClientId,
          [action.upload.clientId]: action.upload,
        },
      };
    case "upload/patch": {
      const current = state.uploadsByClientId[action.clientId];
      if (!current) {
        return state;
      }
      return {
        ...state,
        uploadsByClientId: {
          ...state.uploadsByClientId,
          [action.clientId]: { ...current, ...action.patch },
        },
      };
    }
    case "upload/remove": {
      const next = { ...state.uploadsByClientId };
      const existing = next[action.clientId];
      if (existing?.previewUrl) {
        URL.revokeObjectURL(existing.previewUrl);
      }
      delete next[action.clientId];
      return { ...state, uploadsByClientId: next };
    }
    default:
      return state;
  }
}
