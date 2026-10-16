"use client";

import dynamic from "next/dynamic";

// Click-opened overlays: keep their code out of the first-load bundle.
export const OrganizationOverlays = dynamic(
  () =>
    import("@/features/conversation-organization/components/OrganizationOverlays").then(
      (m) => m.OrganizationOverlays,
    ),
  { ssr: false },
);

export const SafetyOverlays = dynamic(
  () => import("@/features/safety/components/SafetyOverlays").then((m) => m.SafetyOverlays),
  { ssr: false },
);

export const MessageActionsOverlays = dynamic(
  () =>
    import("@/features/message-actions/components/MessageActionsOverlays").then(
      (m) => m.MessageActionsOverlays,
    ),
  { ssr: false },
);
