"use client";

import { memo, useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { getDownloadUrlAction, listSharedAction } from "../actions";
import { formatByteSize } from "../format-bytes";
import styles from "../media.module.css";
import type { SharedItem, SharedTab } from "../types";
import { sharedPageNextCursor } from "../service";

type Props = {
  conversationId: string;
  initialTab: SharedTab;
};

function SharedMediaBrowserInner({ conversationId, initialTab }: Props) {
  const t = useTranslations("media");
  const locale = useLocale();
  const [tab, setTab] = useState<SharedTab>(initialTab);
  const [items, setItems] = useState<SharedItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (nextTab: SharedTab, nextCursor: string | null, append: boolean) => {
      setLoading(true);
      const result = await listSharedAction({
        conversationId,
        tab: nextTab,
        cursor: nextCursor,
      });
      setLoading(false);
      if (!result.ok) {
        return;
      }
      setItems((prev) =>
        append ? [...prev, ...result.value.items] : result.value.items,
      );
      setHasMore(result.value.hasMore);
      setCursor(sharedPageNextCursor(result.value.items));
    },
    [conversationId],
  );

  useEffect(() => {
    void load(tab, null, false);
  }, [load, tab]);

  const openDownload = async (attachmentId: string) => {
    const result = await getDownloadUrlAction({ attachmentId });
    if (result.ok) {
      window.open(result.value.url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className={styles.sharedPage}>
      <div className={styles.tabRow} role="tablist" aria-label={t("sharedTabs")}>
        {(["media", "files", "links"] as SharedTab[]).map((entry) => (
          <button
            key={entry}
            type="button"
            role="tab"
            aria-selected={tab === entry}
            className={styles.tabLink}
            data-active={tab === entry ? "true" : "false"}
            onClick={() => setTab(entry)}
          >
            {t(`tabs.${entry}`)}
          </button>
        ))}
      </div>
      {loading && items.length === 0 ? <p>{t("loading")}</p> : null}
      {!loading && items.length === 0 ? (
        <p className={styles.empty}>{t(`empty.${tab}`)}</p>
      ) : null}
      {tab === "media" ? (
        <div className={styles.grid}>
          {items.map((item) =>
            item.attachment_id ? (
              <button
                key={item.message_id}
                type="button"
                onClick={() => void openDownload(item.attachment_id!)}
                aria-label={t("openImage")}
              >
                {item.file_name ?? t("imageAlt")}
              </button>
            ) : null,
          )}
        </div>
      ) : null}
      {tab === "files" ? (
        <div className={styles.list}>
          {items.map((item) => (
            <button
              key={item.message_id}
              type="button"
              onClick={() =>
                item.attachment_id ? void openDownload(item.attachment_id) : undefined
              }
            >
              {item.file_name} ·{" "}
              {item.size_bytes
                ? formatByteSize(Number(item.size_bytes), locale)
                : ""}
            </button>
          ))}
        </div>
      ) : null}
      {tab === "links" ? (
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={`${item.message_id}-${item.url}`}>
              <a href={item.url ?? "#"} rel="noreferrer noopener">
                {item.url}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {hasMore ? (
        <button type="button" onClick={() => void load(tab, cursor, true)}>
          {t("loadMore")}
        </button>
      ) : null}
    </div>
  );
}

export const SharedMediaBrowser = memo(SharedMediaBrowserInner);
