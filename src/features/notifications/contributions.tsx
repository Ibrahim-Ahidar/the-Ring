import { Bell } from "lucide-react";

import type { FeatureContributions } from "@/shell/slots/types";

import { NotificationNavBadge } from "./components/NotificationNavBadge";

export const contributions: FeatureContributions = {
  nav: [
    {
      id: "notifications",
      labelKey: "navLabel",
      href: "/app/notifications",
      icon: Bell,
      order: 50,
      badge: NotificationNavBadge,
    },
  ],
};
