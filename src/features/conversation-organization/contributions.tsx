import { MoreHorizontal } from "lucide-react";

import type { FeatureContributions } from "@/shell/slots/types";

import { OrganizationOverlays } from "./components/OrganizationOverlays";
import { requestOrganizationMenu } from "./organization-events";

export const contributions: FeatureContributions = {
  overlay: [
    {
      id: "conversation-organization-overlays",
      Component: OrganizationOverlays,
    },
  ],
  listItemMenu: [
    {
      id: "conversation-organization-menu",
      order: 10,
      labelKey: "menuOpen",
      icon: MoreHorizontal,
      isAvailable: () => true,
      run: (ctx) => {
        requestOrganizationMenu(ctx);
      },
    },
  ],
};

/** Mount target for {@link FolderStrip}: `<div id="conversation-folders" />` in the chats list header. */
export { FolderStrip } from "./components/FolderStrip";
