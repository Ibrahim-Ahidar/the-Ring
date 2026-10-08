import {
  Copy,
  CornerUpLeft,
  Forward,
  Link2,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from "lucide-react";

import type { FeatureContributions } from "@/shell/slots/types";

import { MessageActionsOverlays } from "./components/MessageActionsOverlays";
import { ReplyComposerTool } from "./components/ReplyComposerTool";
import { TextMessageWithLinksRenderer } from "./components/TextMessageWithLinksRenderer";
import { copyTextToClipboard } from "./lib/copy-text";
import {
  canCopy,
  canDeleteForEveryone,
  canDeleteForMe,
  canEdit,
  canForward,
  canPin,
  canReply,
} from "./lib/permissions";
import { runPinToggle } from "./lib/run-pin";
import {
  requestActionToast,
  requestDeleteDialog,
  requestEditDialog,
  requestForwardDialog,
  requestJumpToReply,
  setReplyTarget,
} from "./message-actions-events";

export const contributions: FeatureContributions = {
  overlay: [
    {
      id: "message-actions-overlays",
      Component: MessageActionsOverlays,
    },
  ],
  composerTool: [
    {
      id: "message-actions-reply",
      order: 5,
      Component: ReplyComposerTool,
    },
  ],
  messageRenderer: [
    {
      type: "text",
      Component: TextMessageWithLinksRenderer,
    },
  ],
  messageAction: [
    {
      id: "message-actions-reply",
      order: 10,
      labelKey: "actions.reply",
      icon: CornerUpLeft,
      isAvailable: (ctx) => canReply(ctx.message).allowed,
      run: (ctx) => {
        const preview = ctx.message.body?.trim().slice(0, 120) ?? "";
        setReplyTarget({
          conversationId: ctx.conversationId,
          messageId: ctx.message.id,
          preview,
        });
      },
    },
    {
      id: "message-actions-jump-reply",
      order: 15,
      labelKey: "actions.jumpToReply",
      icon: Link2,
      isAvailable: (ctx) =>
        Boolean(ctx.message.reply_to_id) && !ctx.message.id.startsWith("pending-"),
      run: (ctx) => {
        if (!ctx.message.reply_to_id) {
          return;
        }
        requestJumpToReply({
          conversationId: ctx.conversationId,
          replyToId: ctx.message.reply_to_id,
        });
      },
    },
    {
      id: "message-actions-copy",
      order: 20,
      labelKey: "actions.copy",
      icon: Copy,
      isAvailable: (ctx) => canCopy(ctx.message).allowed,
      run: (ctx) => {
        void copyTextToClipboard(ctx.message.body ?? "").then((ok) => {
          requestActionToast(ok ? "toast.copied" : "toast.copyFailed");
        });
      },
    },
    {
      id: "message-actions-edit",
      order: 30,
      labelKey: "actions.edit",
      icon: Pencil,
      isAvailable: (ctx) =>
        canEdit(ctx.message, ctx.currentUserId).allowed,
      run: (ctx) => {
        requestEditDialog({
          message: ctx.message,
          conversationId: ctx.conversationId,
        });
      },
    },
    {
      id: "message-actions-forward",
      order: 40,
      labelKey: "actions.forward",
      icon: Forward,
      isAvailable: (ctx) => canForward(ctx.message).allowed,
      run: (ctx) => {
        requestForwardDialog({
          message: ctx.message,
          sourceConversationId: ctx.conversationId,
        });
      },
    },
    {
      id: "message-actions-pin",
      order: 50,
      labelKey: "actions.pin",
      icon: Pin,
      isAvailable: (ctx) =>
        canPin(ctx.conversationType, ctx.role).allowed &&
        !ctx.message.pinned_at,
      run: (ctx) => {
        void runPinToggle({
          messageId: ctx.message.id,
          conversationId: ctx.conversationId,
          pinned: false,
        });
      },
    },
    {
      id: "message-actions-unpin",
      order: 51,
      labelKey: "actions.unpin",
      icon: PinOff,
      isAvailable: (ctx) =>
        canPin(ctx.conversationType, ctx.role).allowed &&
        Boolean(ctx.message.pinned_at),
      run: (ctx) => {
        void runPinToggle({
          messageId: ctx.message.id,
          conversationId: ctx.conversationId,
          pinned: true,
        });
      },
    },
    {
      id: "message-actions-delete-me",
      order: 70,
      labelKey: "actions.deleteMe",
      icon: Trash2,
      destructive: true,
      isAvailable: (ctx) => canDeleteForMe(ctx.message).allowed,
      run: (ctx) => {
        requestDeleteDialog({
          message: ctx.message,
          conversationId: ctx.conversationId,
          scope: "me",
        });
      },
    },
    {
      id: "message-actions-delete-everyone",
      order: 75,
      labelKey: "actions.deleteEveryone",
      icon: Trash2,
      destructive: true,
      isAvailable: (ctx) =>
        canDeleteForEveryone(
          ctx.message,
          ctx.currentUserId,
          ctx.conversationType,
          ctx.role,
        ).allowed,
      run: (ctx) => {
        requestDeleteDialog({
          message: ctx.message,
          conversationId: ctx.conversationId,
          scope: "everyone",
        });
      },
    },
  ],
};
