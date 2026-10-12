"use client";

import { useCallback, useMemo, useState } from "react";
import { Bell, CheckCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

import { useNotifications } from "../context/NotificationsContext";
import type { NotificationRow } from "../types";
import { NotificationRowItem } from "./NotificationRowItem";
import styles from "./notifications.module.css";

function NotificationsInboxInner() {
  const t = useTranslations("notifications");
  const { state, reload, loadMore, markOneRead, markAllRead } =
    useNotifications();
  const [focusedIndex, setFocusedIndex] = useState(0);

  const groups = useMemo(() => {
    const unread: NotificationRow[] = [];
    const read: NotificationRow[] = [];
    for (const row of state.items) {
      (row.readAt ? read : unread).push(row);
    }
    return { unread, read };
  }, [state.items]);

  const handleActivate = useCallback(
    (id: string) => {
      void markOneRead(id);
    },
    [markOneRead],
  );

  const handleListKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLUListElement>) => {
      if (state.items.length === 0) {
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setFocusedIndex((index) =>
          Math.min(state.items.length - 1, index + 1),
        );
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setFocusedIndex((index) => Math.max(0, index - 1));
      }
    },
    [state.items.length],
  );

  if (state.loading) {
    return (
      <p className={ui.emptyInline} role="status">
        {t("loading")}
      </p>
    );
  }

  if (state.errorCode) {
    return (
      <div className={styles.errorBox} role="alert">
        <p>{t("error")}</p>
        <button
          type="button"
          className={`${ui.btn} ${ui.btnPrimary}`}
          onClick={() => void reload()}
        >
          {t("retry")}
        </button>
      </div>
    );
  }

  const renderList = (rows: NotificationRow[], offset: number) => (
    <ul className={ui.list} aria-label={t("listLabel")} onKeyDown={handleListKeyDown}>
      {rows.map((row, index) => (
        <NotificationRowItem
          key={row.id}
          row={row}
          tabIndex={offset + index === focusedIndex ? 0 : -1}
          onFocus={() => setFocusedIndex(offset + index)}
          onActivate={handleActivate}
        />
      ))}
    </ul>
  );

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <p className={styles.unreadMeta}>
          {t("unreadCount", { count: state.unreadCount })}
        </p>
        {state.unreadCount > 0 ? (
          <button
            type="button"
            className={`${ui.btn} ${ui.btnSm} ${ui.btnGhost}`}
            onClick={() => void markAllRead()}
          >
            <CheckCheck size={16} aria-hidden />
            {t("markAllRead")}
          </button>
        ) : null}
      </div>

      {state.items.length === 0 ? (
        <div className={styles.empty}>
          <span className={ui.emptyStateArt}>
            <Bell size={48} aria-hidden />
          </span>
          <h2 className={styles.emptyTitle}>{t("emptyTitle")}</h2>
          <p className={ui.emptyStateText}>{t("emptyBody")}</p>
        </div>
      ) : (
        <>
          {groups.unread.length > 0 ? (
            <section aria-labelledby="notifications-new">
              <h2 id="notifications-new" className={ui.sectionLabel}>
                {t("sectionNew")}
              </h2>
              {renderList(groups.unread, 0)}
            </section>
          ) : null}
          {groups.read.length > 0 ? (
            <section aria-labelledby="notifications-earlier">
              <h2
                id="notifications-earlier"
                className={`${ui.sectionLabel} ${ui.sectionLabelMuted}`}
              >
                {t("sectionEarlier")}
              </h2>
              {renderList(groups.read, groups.unread.length)}
            </section>
          ) : null}
        </>
      )}

      {state.nextCursor ? (
        <button
          type="button"
          className={`${ui.btn} ${ui.btnSecondary} ${styles.loadMore}`}
          disabled={state.loadingMore}
          onClick={() => void loadMore()}
        >
          {state.loadingMore ? t("loadingMore") : t("loadMore")}
        </button>
      ) : null}
    </div>
  );
}

export const NotificationsInbox = NotificationsInboxInner;
