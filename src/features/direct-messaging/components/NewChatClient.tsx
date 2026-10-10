"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { getContributions } from "@/shell/slots";
import ui from "@/shell/styles/ui.module.css";

import { openDirectAction } from "../actions";

type Translator = {
  (key: "errors.platform.unexpected"): string;
  (key: "errors.messaging.not_allowed"): string;
  has: (key: string) => boolean;
};

/** Translated message for an error code; unknown codes fall back to the generic message. */
export function newChatErrorMessage(t: Translator, code: string): string {
  const key = `errors.${code}` as "errors.messaging.not_allowed";
  return t.has(key) ? t(key) : t("errors.platform.unexpected");
}

function NewChatClientInner() {
  const t = useTranslations("direct-messaging");
  const router = useRouter();
  const params = useSearchParams();
  const fromQuery = params.get("username");
  const [username, setUsername] = useState(fromQuery ?? "");
  const [error, setError] = useState<string | null>(null);
  const [targetUsername, setTargetUsername] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [autoOpening, setAutoOpening] = useState(Boolean(fromQuery));
  const inFlight = useRef(false);
  const requestSlots = useMemo(() => getContributions("requestRequired"), []);

  const open = async (target: string, navigate: "push" | "replace") => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await openDirectAction({ username: target });
      if (result.ok) {
        // Stay pending while navigating so the button cannot be pressed again.
        const href = `/app/chats/${result.value.conversationId}`;
        if (navigate === "replace") {
          router.replace(href);
        } else {
          router.push(href);
        }
        return;
      }
      if (result.error.code === "messaging.request_required") {
        setTargetUsername(target);
      }
      setError(result.error.code);
    } catch {
      setError("platform.unexpected");
    }
    inFlight.current = false;
    setPending(false);
    setAutoOpening(false);
  };

  useEffect(() => {
    if (!fromQuery) {
      return;
    }
    setUsername(fromQuery);
    void open(fromQuery.trim().replace(/^@/, ""), "replace");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per ?username value
  }, [fromQuery]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    await open(username.trim().replace(/^@/, ""), "push");
  };

  if (error === "messaging.request_required" && targetUsername) {
    const slot = requestSlots[0];
    if (slot?.Component) {
      return (
        <slot.Component
          targetUsername={targetUsername}
          onDone={() => router.push("/app/chats")}
        />
      );
    }
    return <p className={ui.notice}>{t("requestRequired")}</p>;
  }

  const visibleError = error && error !== "messaging.request_required" ? error : null;

  if (autoOpening && !visibleError) {
    return (
      <p className={ui.notice} role="status" aria-busy="true">
        {t("opening")}
      </p>
    );
  }

  return (
    <form className={ui.settingsCard} onSubmit={onSubmit}>
      <div className={ui.settingsCardBody}>
        <div className={ui.field}>
          <label className={ui.fieldLabel} htmlFor="new-chat-username">
            {t("usernameLabel")}
          </label>
          <div className={ui.inputPrefix} data-invalid={visibleError ? "true" : undefined}>
            <span aria-hidden>@</span>
            <input
              id="new-chat-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={visibleError ? true : undefined}
              aria-describedby={visibleError ? "new-chat-error" : undefined}
            />
          </div>
          {visibleError ? (
            <p id="new-chat-error" className={ui.fieldError} role="alert">
              {newChatErrorMessage(t, visibleError)}
            </p>
          ) : null}
        </div>
        <button
          type="submit"
          className={`${ui.btn} ${ui.btnPrimary}`}
          disabled={pending}
          aria-busy={pending || undefined}
        >
          {pending ? t("opening") : t("openChat")}
        </button>
      </div>
    </form>
  );
}

export const NewChatClient = memo(NewChatClientInner);
