"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

import { createRequestAction } from "../actions";

const NOTE_MAX = 300;

type Props = {
  username: string;
};

function SendRequestFormInner({ username }: Props) {
  const t = useTranslations("message-requests");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) {
      return;
    }
    setPending(true);
    setError(null);
    try {
      const result = await createRequestAction({ username, note });
      if (result.ok) {
        setSent(true);
      } else {
        setError(result.error.code);
      }
    } catch {
      setError("platform.unexpected");
    }
    setPending(false);
  };

  if (sent) {
    return (
      <p className={ui.notice} role="status">
        {t("sent", { username })} <Link href="/app/chats/requests">{t("viewRequests")}</Link>
      </p>
    );
  }

  return (
    <form className={ui.settingsCard} onSubmit={onSubmit}>
      <div className={ui.settingsCardBody}>
        <p className={ui.notice}>{t("requestRequired", { username })}</p>
        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor="request-note">
            {t("noteLabel")}
          </label>
          <textarea
            id="request-note"
            className="input"
            value={note}
            maxLength={NOTE_MAX}
            rows={3}
            onChange={(event) => setNote(event.target.value)}
          />
          {error ? (
            <p className={ui.fieldError} role="alert">
              {t.has(`errors.${error}`) ? t(`errors.${error}`) : t("errors.generic")}
            </p>
          ) : null}
        </div>
        <button
          type="submit"
          className={`${ui.btn} ${ui.btnPrimary}`}
          disabled={pending}
          aria-busy={pending || undefined}
        >
          {t("send")}
        </button>
      </div>
    </form>
  );
}

export const SendRequestForm = SendRequestFormInner;
