import { Flag } from "lucide-react";

import type { FeatureContributions } from "@/shell/slots/types";

import { SafetyOverlays } from "@/features/safety/components/SafetyOverlays";
import { requestReportDialog } from "@/features/safety/safety-events";

export const contributions: FeatureContributions = {
  overlay: [
    {
      id: "safety-overlays",
      Component: SafetyOverlays,
    },
  ],
  messageAction: [
    {
      id: "safety-report-message",
      order: 80,
      labelKey: "report.reportMessage",
      icon: Flag,
      destructive: true,
      isAvailable: (ctx) =>
        ctx.message.sender_id != null && ctx.message.sender_id !== ctx.currentUserId,
      run: (ctx) => {
        const preview =
          typeof ctx.message.body === "string" && ctx.message.body.trim().length > 0
            ? ctx.message.body.trim().slice(0, 120)
            : null;
        requestReportDialog({
          targetMessageId: ctx.message.id,
          targetUserId: ctx.message.sender_id,
          subjectLabel: preview,
        });
      },
    },
  ],
};
