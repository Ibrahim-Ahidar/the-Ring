import { Search } from "lucide-react";

import type { FeatureContributions } from "@/shell/slots/types";

export const contributions: FeatureContributions = {
  nav: [
    {
      id: "alpha-nav",
      labelKey: "navLabel",
      href: "/app/alpha",
      icon: Search,
      order: 1,
    },
  ],
};
