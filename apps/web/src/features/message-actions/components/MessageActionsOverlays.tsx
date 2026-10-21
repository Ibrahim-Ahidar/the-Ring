"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { listConversationsAction } from "@/features/direct-messaging/actions";
import type { ConversationSummary } from "@/features/direct-messaging/types";
import { randomUUID } from "@pulse/core/uuid";

import {
  deleteForEveryoneAction,
  editMessageAction,
  forwardMessageAction,
  hideMessageAction,
} from "../actions";
import { useFocusTrap } from "../hooks/useFocusTrap";
import {
  emitMessageMutation,
  onMessageActionDialog,
  type DeleteDialogRequest,
  type EditDialogRequest,
  type ForwardDialogRequest,
} from "../message-actions-events";
import styles from "../message-actions.module.css";
import ui from "@/shell/styles/ui.module.css";

const SCRIM = `${ui.scrim} ${ui.scrimCenter} ${ui.scrimSheet}`;

type DialogState =
  | { kind: "edit"; request: EditDialogRequest }
  | { kind: "delete"; request: DeleteDialogRequest }
  | { kind: "forward"; request: ForwardDialogRequest }
  | null;

function MessageActionsOverlaysInner() {
  const t = useTranslations("message-actions");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [toastKey, setToastKey] = useState<string | null>(null);
  const trapRef = useFocusTrap(dialog !== null);

  useEffect(() => {
    return onMessageActionDialog((request) => {
      if ("kind" in request && request.kind === "toast") {
        setToastKey(request.messageKey);
        window.setTimeout(() => setToastKey(null), 3200);
        return;
      }
      if ("scope" in request && "message" in request) {
        setDialog({ kind: "delete", request: request as DeleteDialogRequest });
        return;
      }
      if ("sourceConversationId" in request) {
        setDialog({ kind: "forward", request: request as ForwardDialogRequest });
        return;
      }
      if ("message" in request && "conversationId" in request) {
        setDialog({ kind: "edit", request: request as EditDialogRequest });
      }
    });
  }, []);

  const close = useCallback(() => setDialog(null), []);

  return (
    <>
      {toastKey ? (
        <p className={styles.toast} role="status">
          {t(toastKey as never)}
        </p>
      ) : null}
      {dialog?.kind === "edit" ? (
        <EditDialog
          trapRef={trapRef}
          request={dialog.request}
          onClose={close}
          t={t}
        />
      ) : null}
      {dialog?.kind === "delete" ? (
        <DeleteDialog
          trapRef={trapRef}
          request={dialog.request}
          onClose={close}
          t={t}
        />
      ) : null}
      {dialog?.kind === "forward" ? (
        <ForwardDialog
          trapRef={trapRef}
          request={dialog.request}
          onClose={close}
          t={t}
        />
      ) : null}
    </>
  );
}

type DialogProps<T> = {
  trapRef: ReturnType<typeof useFocusTrap>;
  request: T;
  onClose: () => void;
  t: ReturnType<typeof useTranslations<"message-actions">>;
};

function EditDialog({
  trapRef,
  request,
  onClose,
  t,
}: DialogProps<EditDialogRequest>) {
  const [body, setBody] = useState(request.message.body ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await editMessageAction({
      messageId: request.message.id,
      body,
    });
    setBusy(false);
    if (!result.ok) {
      const code = result.error.code.replace("message_actions.", "");
      setError(t(`errors.message_actions.${code}` as never));
      return;
    }
    emitMessageMutation({
      kind: "upsert",
      conversationId: request.conversationId,
      message: result.value,
    });
    onClose();
  };

  return (
    <div className={SCRIM} onClick={onClose} role="presentation">
      <div
        ref={trapRef}
        className={ui.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="edit-dialog-title" className={ui.dialogTitle}>
          {t("edit.title")}
        </h2>
        <label className="sr-only" htmlFor="edit-message-body">
          {t("edit.label")}
        </label>
        <textarea
          id="edit-message-body"
          className={ui.input}
          rows={4}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
        {error ? <p className={ui.errorText} role="alert">{error}</p> : null}
        <div className={ui.dialogActions}>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={onClose} disabled={busy}>
            {t("actions.cancel")}
          </button>
          <button type="button" className={`${ui.btn} ${ui.btnPrimary}`} onClick={submit} disabled={busy}>
            {t("edit.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteDialog({
  trapRef,
  request,
  onClose,
  t,
}: DialogProps<DeleteDialogRequest>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEveryone = request.scope === "everyone";

  const submit = async () => {
    setBusy(true);
    setError(null);
    if (request.scope === "me") {
      const result = await hideMessageAction({ messageId: request.message.id });
      setBusy(false);
      if (!result.ok) {
        setError(t("errors.generic"));
        return;
      }
      emitMessageMutation({
        kind: "hide",
        conversationId: request.conversationId,
        messageId: request.message.id,
      });
      onClose();
      return;
    }

    const result = await deleteForEveryoneAction({ messageId: request.message.id });
    setBusy(false);
    if (!result.ok) {
      setError(t("errors.generic"));
      return;
    }
    emitMessageMutation({
      kind: "upsert",
      conversationId: request.conversationId,
      message: result.value,
    });
    onClose();
  };

  return (
    <div className={SCRIM} onClick={onClose} role="presentation">
      <div
        ref={trapRef}
        className={ui.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="delete-dialog-title" className={ui.dialogTitle}>
          {isEveryone ? t("delete.everyoneTitle") : t("delete.meTitle")}
        </h2>
        <p className={ui.dialogText}>
          {isEveryone ? t("delete.everyoneBody") : t("delete.meBody")}
        </p>
        {error ? <p className={ui.errorText} role="alert">{error}</p> : null}
        <div className={ui.dialogActions}>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={onClose} disabled={busy}>
            {t("actions.cancel")}
          </button>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnDanger}`}
            onClick={submit}
            disabled={busy}
          >
            {isEveryone ? t("delete.everyoneConfirm") : t("delete.meConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ForwardDialog({
  trapRef,
  request,
  onClose,
  t,
}: DialogProps<ForwardDialogRequest>) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void listConversationsAction({}).then((result) => {
      if (result.ok) {
        setConversations(
          result.value.items.filter((item) => item.id !== request.sourceConversationId),
        );
      }
    });
  }, [request.sourceConversationId]);

  const submit = async () => {
    if (!targetId) {
      return;
    }
    setBusy(true);
    setError(null);
    const result = await forwardMessageAction({
      sourceMessageId: request.message.id,
      targetConversationId: targetId,
      clientId: randomUUID(),
    });
    setBusy(false);
    if (!result.ok) {
      setError(t("errors.generic"));
      return;
    }
    onClose();
  };

  return (
    <div className={SCRIM} onClick={onClose} role="presentation">
      <div
        ref={trapRef}
        className={ui.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="forward-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="forward-dialog-title" className={ui.dialogTitle}>
          {t("forward.title")}
        </h2>
        <label className="sr-only" htmlFor="forward-target">
          {t("forward.label")}
        </label>
        <select
          id="forward-target"
          className={ui.input}
          value={targetId}
          onChange={(event) => setTargetId(event.target.value)}
        >
          <option value="">{t("forward.placeholder")}</option>
          {conversations.map((conversation) => (
            <option key={conversation.id} value={conversation.id}>
              {conversation.title ??
                conversation.other_display_name ??
                conversation.other_username ??
                conversation.id}
            </option>
          ))}
        </select>
        {error ? <p className={ui.errorText} role="alert">{error}</p> : null}
        <div className={ui.dialogActions}>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={onClose} disabled={busy}>
            {t("actions.cancel")}
          </button>
          <button type="button" className={`${ui.btn} ${ui.btnPrimary}`} onClick={submit} disabled={busy}>
            {t("forward.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

export const MessageActionsOverlays = memo(MessageActionsOverlaysInner);
