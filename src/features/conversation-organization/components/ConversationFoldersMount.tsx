"use client";

import { memo, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

import { useOrganization } from "../context/OrganizationProvider";
import { FolderStrip } from "./FolderStrip";

const HOST_ID = "conversation-folders";
const READY_EVENT = "conversation-folders:ready";

function ConversationFoldersMountInner() {
  const { state, refreshFolders } = useOrganization();
  const pathname = usePathname();
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // Only attach to a host that has finished hydrating (it sets data-ready);
    // portaling earlier would add children React does not expect.
    const sync = () => {
      const el = document.getElementById(HOST_ID);
      setHost(el?.dataset.ready === "1" ? el : null);
    };
    sync();
    document.addEventListener(READY_EVENT, sync);
    return () => document.removeEventListener(READY_EVENT, sync);
  }, [pathname]);

  if (!host) {
    return null;
  }

  return createPortal(<FolderStrip folders={state.folders} onFoldersChanged={() => void refreshFolders()} />, host);
}

export const ConversationFoldersMount = memo(ConversationFoldersMountInner);
