import type { FeatureContributions } from "@/shell/slots/types";

import { TextMessageRenderer } from "./components/TextMessageRenderer";

export const contributions: FeatureContributions = {
  messageRenderer: [
    {
      type: "text",
      Component: TextMessageRenderer,
    },
  ],
};
