import type { ChatFolder } from "../types";

export type OrganizationState = {
  folders: ChatFolder[];
  foldersLoaded: boolean;
  foldersError: string | null;
};

export type OrganizationAction =
  | { type: "folders/set"; folders: ChatFolder[] }
  | { type: "folders/error"; code: string | null }
  | { type: "folders/loaded" };

export function createInitialOrganizationState(): OrganizationState {
  return {
    folders: [],
    foldersLoaded: false,
    foldersError: null,
  };
}
