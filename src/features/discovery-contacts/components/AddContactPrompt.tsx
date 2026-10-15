"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

import { favoriteAction, listFavoritesAction } from "../actions";

type Props = {
  userId: string;
  username: string;
  displayName: string | null;
};

const dismissKey = (userId: string) => `contact-prompt-dismissed:${userId}`;

/** Asks once per person whether to add them to contacts. "No" is remembered
 * on this device; the profile page always keeps the add button. */
export function AddContactPrompt({ userId, username, displayName }: Props) {
  const t = useTranslations("discovery-contacts");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setVisible(false);
    if (localStorage.getItem(dismissKey(userId))) {
      return;
    }
    void listFavoritesAction().then((result) => {
      if (cancelled || !result.ok) {
        return;
      }
      setVisible(!result.value.some((f) => f.favoriteUserId === userId));
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const onAdd = useCallback(async () => {
    setBusy(true);
    const result = await favoriteAction(username);
    setBusy(false);
    if (result.ok) {
      setVisible(false);
    }
  }, [username]);

  const onDismiss = useCallback(() => {
    localStorage.setItem(dismissKey(userId), "1");
    setVisible(false);
  }, [userId]);

  if (!visible) {
    return null;
  }

  return (
    <div
      role="region"
      aria-label={t("prompt.question", { name: displayName ?? username })}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        padding: "8px 16px",
        borderBottom: "1px solid var(--border, rgba(128,128,128,.25))",
      }}
    >
      <span style={{ flex: 1, minWidth: 160 }}>
        {t("prompt.question", { name: displayName ?? username })}
      </span>
      <button type="button" className={ui.iconBtn} disabled={busy} onClick={() => void onAdd()}>
        {t("prompt.yes")}
      </button>
      <button type="button" className={ui.iconBtn} disabled={busy} onClick={onDismiss}>
        {t("prompt.no")}
      </button>
    </div>
  );
}
