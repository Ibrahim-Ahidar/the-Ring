import type { OrganizationAction, OrganizationState } from "./types";

export function organizationReducer(
  state: OrganizationState,
  action: OrganizationAction,
): OrganizationState {
  switch (action.type) {
    case "folders/set":
      return {
        ...state,
        folders: action.folders,
        foldersLoaded: true,
        foldersError: null,
      };
    case "folders/error":
      return {
        ...state,
        foldersLoaded: true,
        foldersError: action.code,
      };
    case "folders/loaded":
      return { ...state, foldersLoaded: true };
    default:
      return state;
  }
}
