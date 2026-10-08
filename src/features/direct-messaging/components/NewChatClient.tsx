"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { getContributions } from "@/shell/slots";

import { openDirectAction } from "../actions";
import styles from "../direct-messaging.module.css";

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
    const result = await openDirectAction({ username: username.trim() });
    if (result.ok) {
      router.push(`/app/chats/${result.value.conversationId}`);
      return;
    }
    if (result.error.code === "messaging.request_required") {
      setError(result.error.code);
      setTargetUserId(username.trim());
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
    return (
      <div className={styles.empty}>
        <p>{t("requestRequired")}</p>
      </div>
    );
  }

  return (
    <form className={styles.empty} onSubmit={onSubmit}>
      <h1>{t("newChatTitle")}</h1>
      <label htmlFor="new-chat-username">{t("usernameLabel")}</label>
      <input
        id="new-chat-username"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
        autoComplete="username"
      />
      <button type="submit">{t("openChat")}</button>
      {error && error !== "messaging.request_required" ? (
        <p role="alert">
          {error in { "messaging.not_allowed": 1, "messaging.not_found": 1, "platform.unauthenticated": 1, "platform.unexpected": 1 }
            ? t(`errors.${error}` as "errors.messaging.not_allowed")
            : error}
        </p>
      ) : null}
    </form>
  );
}

export const NewChatClient = memo(NewChatClientInner);
