"use client";

import { memo, useCallback, useState } from "react";
import { useTranslations } from "next-intl";

import { useNotifications } from "../context/NotificationsContext";
import { NotificationRowItem } from "./NotificationRowItem";
import styles from "./notifications.module.css";

function NotificationsInboxInner() {
  const t = useTranslations("notifications");
  const { state, reload, loadMore, markOneRead, markAllRead } =
    useNotifications();
  const [focusedIndex, setFocusedIndex] = useState(0);

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
      <p className={styles.loading} role="status">
        {t("loading")}
      </p>
    );
  }

  if (state.errorCode) {
    return (
      <div className={styles.errorBox} role="alert">
        <p>{t("error")}</p>
        <div className={styles.actionsRow}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void reload()}
          >
            {t("retry")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <p className={styles.unreadMeta}>
          {t("unreadCount", { count: state.unreadCount })}
        </p>
        {state.unreadCount > 0 ? (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => void markAllRead()}
          >
            {t("markAllRead")}
          </button>
        ) : null}
      </div>

      {state.items.length === 0 ? (
        <div className={styles.empty}>
          <h2>{t("emptyTitle")}</h2>
          <p>{t("emptyBody")}</p>
        </div>
      ) : (
        <ul
          className={styles.list}
          aria-label={t("listLabel")}
          onKeyDown={handleListKeyDown}
        >
          {state.items.map((row, index) => (
            <NotificationRowItem
              key={row.id}
              row={row}
              tabIndex={index === focusedIndex ? 0 : -1}
              onFocus={() => setFocusedIndex(index)}
              onActivate={handleActivate}
            />
          ))}
        </ul>
      )}

      {state.nextCursor ? (
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={state.loadingMore}
          onClick={() => void loadMore()}
        >
          {state.loadingMore ? t("loadingMore") : t("loadMore")}
        </button>
      ) : null}
    </div>
  );
}

export const NotificationsInbox = memo(NotificationsInboxInner);
