import { MailQuestion } from "lucide-react";

import type { FeatureContributions } from "@/shell/slots/types";

import { MessageRequestsNavBadge } from "./components/MessageRequestsNavBadge";
import { MessageRequestsQueryOverlay } from "./components/MessageRequestsQueryOverlay";
import { RequestRequiredForm } from "./components/RequestRequiredForm";

export const contributions: FeatureContributions = {
  requestRequired: [
    {
      id: "message-requests-form",
      Component: RequestRequiredForm,
    },
  ],
  nav: [
    {
      id: "message-requests",
      labelKey: "navLabel",
      href: "/app/chats/requests",
      icon: MailQuestion,
      order: 35,
      badge: MessageRequestsNavBadge,
    },
  ],
  overlay: [
    {
      id: "message-requests-query",
      Component: MessageRequestsQueryOverlay,
    },
  ],
};
