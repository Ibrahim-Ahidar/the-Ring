import type { ListItemMenuContext } from "@/shell/slots/types";

export type OrganizationMenuRequest = ListItemMenuContext;

type Listener = (request: OrganizationMenuRequest) => void;

const listeners = new Set<Listener>();

export function requestOrganizationMenu(request: OrganizationMenuRequest): void {
  for (const listener of listeners) {
    listener(request);
  }
}

export function onOrganizationMenuRequest(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export type FolderDialogMode =
  | { kind: "create" }
  | { kind: "rename"; folderId: string; currentName: string };

type FolderDialogListener = (mode: FolderDialogMode | null) => void;

const folderListeners = new Set<FolderDialogListener>();

export function requestFolderDialog(mode: FolderDialogMode | null): void {
  for (const listener of folderListeners) {
    listener(mode);
  }
}

export function onFolderDialogRequest(listener: FolderDialogListener): () => void {
  folderListeners.add(listener);
  return () => folderListeners.delete(listener);
}
