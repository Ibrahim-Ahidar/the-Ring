import { MessageCircle } from "lucide-react";

import type { FeatureContributions } from "@/shell/slots/types";

export const contributions: FeatureContributions = {
  nav: [
    {
      id: "beta-nav",
      labelKey: "navLabel",
      href: "/app/beta",
      icon: MessageCircle,
      order: 5,
    },
  ],
};
