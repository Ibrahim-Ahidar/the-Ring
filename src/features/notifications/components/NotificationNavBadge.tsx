"use client";

import { memo, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { createSupabaseBrowserClient } from "@/platform/supabase/browser";
import ui from "@/shell/styles/ui.module.css";

import { useNotificationsUnreadBadge } from "../context/NotificationsContext";

function NotificationNavBadgeInner() {
  const t = useTranslations("notifications");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      return;
    }
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) {
        setUserId(data.user?.id ?? null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const count = useNotificationsUnreadBadge(userId ?? "");

  if (!userId || count <= 0) {
    return null;
  }

  return (
    <span className={ui.badge}>
      <span aria-hidden>{t("unreadBadge", { count })}</span>
      <span className="sr-only">{t("unreadCount", { count })}</span>
    </span>
  );
}

export const NotificationNavBadge = memo(NotificationNavBadgeInner);
