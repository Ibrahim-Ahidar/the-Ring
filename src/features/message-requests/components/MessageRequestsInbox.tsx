"use client";

import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

import { useMessageRequests } from "../context/MessageRequestsProvider";
import { messageRequestErrorMessage } from "../error-message";
import styles from "../message-requests.module.css";
import { IncomingRequestRow } from "./IncomingRequestRow";
import { OutgoingRequestRow } from "./OutgoingRequestRow";

function MessageRequestsInboxInner() {
  const t = useTranslations("message-requests");
  const { state } = useMessageRequests();

  if (state.loading) {
    return <p className={ui.emptyInline}>{t("loading")}</p>;
  }

  if (state.errorCode) {
    return (
      <p className={`${ui.errorText} ${styles.alert}`} role="alert">
        {messageRequestErrorMessage(t, state.errorCode)}
      </p>
    );
  }

  const pendingIncoming = state.incoming.filter((row) => row.status === "pending");

  return (
    <>
      <section className={ui.settingsCard} aria-labelledby="incoming-requests-title">
        <div className={ui.settingsCardHead}>
          <h2 id="incoming-requests-title" className={ui.settingsCardTitle}>
            {t("incomingTitle")}
          </h2>
        </div>
        {pendingIncoming.length === 0 ? (
          <p className={styles.empty}>{t("incomingEmpty")}</p>
        ) : (
          <ul className={styles.list}>
            {pendingIncoming.map((item) => (
              <IncomingRequestRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </section>

      <section className={ui.settingsCard} aria-labelledby="outgoing-requests-title">
        <div className={ui.settingsCardHead}>
          <h2 id="outgoing-requests-title" className={ui.settingsCardTitle}>
            {t("outgoingTitle")}
          </h2>
        </div>
        {state.outgoing.length === 0 ? (
          <p className={styles.empty}>{t("outgoingEmpty")}</p>
        ) : (
          <ul className={styles.list}>
            {state.outgoing.map((item) => (
              <OutgoingRequestRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export const MessageRequestsInbox = MessageRequestsInboxInner;
