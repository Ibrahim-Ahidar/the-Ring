"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { memo, useState } from "react";
import { useTranslations } from "next-intl";

import { Avatar } from "@/shell/components/Avatar";
import ui from "@/shell/styles/ui.module.css";

import { acceptRequestAction, declineRequestAction } from "../actions";
import type { MessageRequest } from "../types";

type Props = {
  incoming: MessageRequest[];
  outgoing: MessageRequest[];
};

type RowProps = {
  request: MessageRequest;
  onAccept: (id: string) => Promise<void>;
  onDecline: (id: string) => Promise<void>;
};

const IncomingRow = memo(function IncomingRow({ request, onAccept, onDecline }: RowProps) {
  const t = useTranslations("message-requests");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const name = request.displayName?.trim() || request.username;
  const run = async (fn: (id: string) => Promise<void>) => {
    setBusy(true);
    await fn(request.id);
    setBusy(false);
  };
  return (
    <li className={ui.memberRow}>
      <Avatar name={name} seed={request.userId} size="md" />
      <span className={ui.memberRowBody}>
        <span className={`${ui.memberRowName} bidi-auto`}>{name}</span>
        <span className="bidi-auto">@{request.username}</span>
        {request.note ? <span className="bidi-auto">{request.note}</span> : null}
      </span>
      {confirming ? (
        <span role="group" aria-label={t("declineConfirm", { name })}>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnDanger}`}
            disabled={busy}
            onClick={() => void run(onDecline)}
          >
            {t("declineConfirmAction")}
          </button>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            disabled={busy}
            onClick={() => setConfirming(false)}
          >
            {t("cancel")}
          </button>
        </span>
      ) : (
        <span>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnPrimary}`}
            disabled={busy}
            aria-label={`${t("accept")}: ${name}`}
            onClick={() => void run(onAccept)}
          >
            {t("accept")}
          </button>
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSecondary}`}
            disabled={busy}
            aria-label={`${t("decline")}: ${name}`}
            onClick={() => setConfirming(true)}
          >
            {t("decline")}
          </button>
        </span>
      )}
    </li>
  );
});

function RequestsViewInner({ incoming, outgoing }: Props) {
  const t = useTranslations("message-requests");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const accept = async (id: string) => {
    setError(null);
    try {
      const result = await acceptRequestAction(id);
      if (result.ok) {
        router.push(`/app/chats/${result.value.conversationId}`);
        return;
      }
      setError(result.error.code);
    } catch {
      setError("platform.unexpected");
    }
  };
  const decline = async (id: string) => {
    setError(null);
    try {
      const result = await declineRequestAction(id);
      if (result.ok) {
        router.refresh();
        return;
      }
      setError(result.error.code);
    } catch {
      setError("platform.unexpected");
    }
  };

  const pendingIncoming = incoming.filter((r) => r.status === "pending");

  return (
    <div>
      {error ? (
        <p className={ui.fieldError} role="alert">
          {t.has(`errors.${error}`) ? t(`errors.${error}`) : t("errors.generic")}
        </p>
      ) : null}
      <section aria-labelledby="requests-incoming">
        <h2 id="requests-incoming" className={ui.fieldLabel}>
          {t("incomingTitle")}
        </h2>
        {pendingIncoming.length === 0 ? (
          <p className={ui.notice}>{t("emptyIncoming")}</p>
        ) : (
          <ul className={ui.settingsCard} aria-label={t("incomingTitle")}>
            {pendingIncoming.map((request) => (
              <IncomingRow
                key={request.id}
                request={request}
                onAccept={accept}
                onDecline={decline}
              />
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="requests-outgoing">
        <h2 id="requests-outgoing" className={ui.fieldLabel}>
          {t("outgoingTitle")}
        </h2>
        {outgoing.length === 0 ? (
          <p className={ui.notice}>{t("emptyOutgoing")}</p>
        ) : (
          <ul className={ui.settingsCard} aria-label={t("outgoingTitle")}>
            {outgoing.map((request) => {
              const name = request.displayName?.trim() || request.username;
              return (
                <li key={request.id} className={ui.memberRow}>
                  <Avatar name={name} seed={request.userId} size="md" />
                  <span className={ui.memberRowBody}>
                    <span className={`${ui.memberRowName} bidi-auto`}>{name}</span>
                    <span className="bidi-auto">@{request.username}</span>
                  </span>
                  {request.status === "accepted" && request.conversationId ? (
                    <Link href={`/app/chats/${request.conversationId}`}>{t("status.accepted")}</Link>
                  ) : (
                    <span>{t(`status.${request.status}`)}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export const RequestsView = RequestsViewInner;
