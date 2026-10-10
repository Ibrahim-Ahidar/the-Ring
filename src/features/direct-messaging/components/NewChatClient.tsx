"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { getContributions } from "@/shell/slots";
import ui from "@/shell/styles/ui.module.css";

import { openDirectAction } from "../actions";

function NewChatClientInner() {
  const t = useTranslations("direct-messaging");
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState(params.get("username") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const requestSlots = useMemo(() => getContributions("requestRequired"), []);

  useEffect(() => {
    const fromQuery = params.get("username");
    if (!fromQuery) {
      return;
    }
    setUsername(fromQuery);
    void (async () => {
      const result = await openDirectAction({ username: fromQuery });
      if (result.ok) {
        router.replace(`/app/chats/${result.value.conversationId}`);
        return;
      }
      if (result.error.code === "messaging.request_required") {
        setError(result.error.code);
        setTargetUserId(fromQuery);
        return;
      }
      setError(result.error.code);
    })();
  }, [params, router]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const target = username.trim().replace(/^@/, "");
    const result = await openDirectAction({ username: target });
    if (result.ok) {
      router.push(`/app/chats/${result.value.conversationId}`);
      return;
    }
    if (result.error.code === "messaging.request_required") {
      setError(result.error.code);
      setTargetUserId(target);
      return;
    }
    setError(result.error.code);
  };

  if (error === "messaging.request_required" && targetUserId) {
    const slot = requestSlots[0];
    if (slot?.Component) {
      return (
        <slot.Component
          targetUserId={targetUserId}
          onDone={() => router.push("/app/chats")}
        />
      );
    }
    return <p className={ui.notice}>{t("requestRequired")}</p>;
  }

  const visibleError = error && error !== "messaging.request_required" ? error : null;

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
              {visibleError in { "messaging.not_allowed": 1, "messaging.not_found": 1, "platform.unauthenticated": 1, "platform.unexpected": 1 }
                ? t(`errors.${visibleError}` as "errors.messaging.not_allowed")
                : visibleError}
            </p>
          ) : null}
        </div>
        <button type="submit" className={`${ui.btn} ${ui.btnPrimary}`}>
          {t("openChat")}
        </button>
      </div>
    </form>
  );
}

export const NewChatClient = memo(NewChatClientInner);
