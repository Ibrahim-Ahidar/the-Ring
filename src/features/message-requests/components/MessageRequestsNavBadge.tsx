"use client";

import { memo, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { countPendingIncomingAction } from "../actions";
import ui from "@/shell/styles/ui.module.css";

function MessageRequestsNavBadgeInner() {
  const t = useTranslations("message-requests");
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const result = await countPendingIncomingAction();
      if (!cancelled && result.ok) {
        setCount(result.value);
      }
    };
    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  if (count <= 0) {
    return null;
  }

  return (
    <span className={ui.badge} aria-label={t("pendingBadge", { count })}>
      {count > 99 ? "99+" : count}
    </span>
  );
}

export const MessageRequestsNavBadge = memo(MessageRequestsNavBadgeInner);
