"use client";

import { memo, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { createSupabaseBrowserClient } from "@/platform/supabase/browser";

import { useNotificationsUnreadBadge } from "../context/NotificationsContext";
import styles from "./notifications.module.css";

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
    <span className={styles.badge} aria-hidden>
      {t("unreadBadge", { count })}
    </span>
  );
}

export const NotificationNavBadge = memo(NotificationNavBadgeInner);
