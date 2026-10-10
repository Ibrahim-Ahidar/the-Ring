"use client";

import { memo, useState } from "react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

import { createRequestAction } from "../actions";
import { messageRequestErrorMessage } from "../error-message";

const NOTE_MAX = 300;

type Props = {
  /** New-chat slot passes the target username in `targetUserId`. */
  targetUserId: string;
  onDone: () => void;
};

function RequestRequiredFormInner({ targetUserId, onDone }: Props) {
  const t = useTranslations("message-requests");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const trimmed = note.trim();
    if (trimmed.length > NOTE_MAX) {
      setError("message_requests.note_too_long");
      return;
    }
    setPending(true);
    const result = await createRequestAction({
      username: targetUserId.trim(),
      note: trimmed,
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error.code);
      return;
    }
    setSent(true);
  };

  if (sent) {
    return (
      <div className={ui.settingsCard}>
        <div className={ui.settingsCardHead}>
          <h2 className={ui.settingsCardTitle}>{t("requestSentTitle")}</h2>
          <p className={ui.settingsCardDesc}>{t("requestSentBody")}</p>
        </div>
        <div className={ui.settingsCardBody}>
          <div className={ui.dialogActions}>
            <button type="button" className={`${ui.btn} ${ui.btnPrimary}`} onClick={onDone}>
              {t("backToChats")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form className={ui.settingsCard} onSubmit={onSubmit}>
      <div className={ui.settingsCardHead}>
        <h2 className={ui.settingsCardTitle}>{t("requestFormTitle")}</h2>
        <p className={ui.settingsCardDesc}>
          {t("requestFormIntro", { username: targetUserId })}
        </p>
      </div>
      <div className={ui.settingsCardBody}>
        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor="message-request-note">
            {t("noteLabel")}
          </label>
          <textarea
            id="message-request-note"
            className={ui.input}
            value={note}
            maxLength={NOTE_MAX}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("notePlaceholder")}
            aria-describedby="message-request-note-count"
          />
          <span id="message-request-note-count" className={ui.fieldHint}>
            {t("noteCounter", { count: note.trim().length, max: NOTE_MAX })}
          </span>
        </div>
        {error ? (
          <p className={ui.errorText} role="alert">
            {messageRequestErrorMessage(t, error)}
          </p>
        ) : null}
        <div className={ui.dialogActions}>
          <button type="button" className={`${ui.btn} ${ui.btnSecondary}`} onClick={onDone}>
            {t("cancel")}
          </button>
          <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`} disabled={pending}>
            {t("sendRequest")}
          </button>
        </div>
      </div>
    </form>
  );
}

export const RequestRequiredForm = memo(RequestRequiredFormInner);
