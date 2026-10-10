"use client";

import { memo, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";

import { useOrganization } from "../context/OrganizationProvider";
import { FolderStrip } from "./FolderStrip";

const HOST_ID = "conversation-folders";

function ConversationFoldersMountInner() {
  const { state } = useOrganization();
  const pathname = usePathname();
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.getElementById(HOST_ID));
  }, [pathname]);

  if (!host) {
    return null;
  }

  return createPortal(<FolderStrip folders={state.folders} />, host);
}

export const ConversationFoldersMount = memo(ConversationFoldersMountInner);
