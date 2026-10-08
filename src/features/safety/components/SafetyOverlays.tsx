"use client";

import { memo, useCallback, useEffect, useState } from "react";

import {
  blockUserAction,
  reportMessageAction,
  reportUserAction,
} from "../actions";
import {
  onSafetyDialogRequest,
  type BlockDialogRequest,
  type ReportDialogRequest,
} from "../safety-events";
import { BlockConfirmDialog } from "./BlockConfirmDialog";
import { ReportDialog } from "./ReportDialog";

type DialogState =
  | { kind: "block"; request: BlockDialogRequest }
  | { kind: "report"; request: ReportDialogRequest }
  | null;

function SafetyOverlaysInner() {
  const [dialog, setDialog] = useState<DialogState>(null);

  useEffect(() => {
    return onSafetyDialogRequest((request, kind) => {
      if (kind === "block") {
        setDialog({ kind: "block", request: request as BlockDialogRequest });
      } else {
        setDialog({ kind: "report", request: request as ReportDialogRequest });
      }
    });
  }, []);

  const close = useCallback(() => setDialog(null), []);

  if (!dialog) {
    return null;
  }

  if (dialog.kind === "block") {
    return (
      <BlockConfirmDialog
        username={dialog.request.username}
        displayName={dialog.request.displayName}
        onClose={close}
        onConfirm={async () => {
          const result = await blockUserAction(dialog.request.userId);
          return result.ok;
        }}
      />
    );
  }

  return (
    <ReportDialog
      subjectLabel={dialog.request.subjectLabel}
      onClose={close}
      onSubmit={async ({ category, details }) => {
        const result = dialog.request.targetMessageId
          ? await reportMessageAction({
              targetMessageId: dialog.request.targetMessageId,
              category,
              details,
              targetUserId: dialog.request.targetUserId,
            })
          : await reportUserAction({
              targetUserId: dialog.request.targetUserId!,
              category,
              details,
            });
        return result.ok;
      }}
    />
  );
}

export const SafetyOverlays = memo(SafetyOverlaysInner);
