"use client";

import { memo, useCallback, useEffect, useState } from "react";

import type { ListItemMenuContext } from "@/shell/slots/types";

import { OrganizationProvider, useOrganization } from "../context/OrganizationProvider";
import {
  onFolderDialogRequest,
  onOrganizationMenuRequest,
  type FolderDialogMode,
} from "../organization-events";
import { ConversationFoldersMount } from "./ConversationFoldersMount";
import { ConversationMenuSheet } from "./ConversationMenuSheet";
import { FolderNameDialog } from "./FolderNameDialog";

function OrganizationOverlaysInner() {
  const { state, refreshFolders } = useOrganization();
  const [menuCtx, setMenuCtx] = useState<ListItemMenuContext | null>(null);
  const [folderDialog, setFolderDialog] = useState<FolderDialogMode | null>(null);

  useEffect(() => {
    return onOrganizationMenuRequest((request) => {
      setMenuCtx(request);
    });
  }, []);

  useEffect(() => {
    return onFolderDialogRequest((mode) => {
      setFolderDialog(mode);
    });
  }, []);

  const closeMenu = useCallback(() => setMenuCtx(null), []);
  const closeFolderDialog = useCallback(() => setFolderDialog(null), []);

  return (
    <>
      <ConversationFoldersMount />
      {menuCtx ? (
        <ConversationMenuSheet
          ctx={menuCtx}
          folders={state.folders}
          onClose={closeMenu}
        />
      ) : null}
      {folderDialog ? (
        <FolderNameDialog
          mode={folderDialog}
          onClose={closeFolderDialog}
          onSaved={() => void refreshFolders()}
        />
      ) : null}
    </>
  );
}

function OrganizationOverlaysRoot() {
  return (
    <OrganizationProvider>
      <OrganizationOverlaysInner />
    </OrganizationProvider>
  );
}

export const OrganizationOverlays = memo(OrganizationOverlaysRoot);
