"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText, Link2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

import { getDownloadUrlAction, listSharedAction } from "../actions";
import { formatByteSize } from "../format-bytes";
import { useDownloadUrl } from "../hooks/useDownloadUrl";
import styles from "../media.module.css";
import type { SharedItem, SharedTab } from "../types";
import { sharedPageNextCursor } from "../service";

type Props = {
  conversationId: string;
  initialTab: SharedTab;
};

const TABS: SharedTab[] = ["media", "files", "links"];

function SharedImageTile({
  attachmentId,
  label,
  onOpen,
}: {
  attachmentId: string;
  label: string;
  onOpen: () => void;
}) {
  const src = useDownloadUrl(attachmentId);
  return (
    <button type="button" className={styles.tile} onClick={onOpen} aria-label={label}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" />
      ) : null}
    </button>
  );
}

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
      <div className={ui.chips} role="tablist" aria-label={t("sharedTabs")}>
        {TABS.map((entry) => (
          <button
            key={entry}
            type="button"
            role="tab"
            aria-selected={tab === entry}
            className={ui.chip}
            onClick={() => setTab(entry)}
          >
            {t(`tabs.${entry}`)}
          </button>
        ))}
      </div>
      {loading && items.length === 0 ? <p className={ui.emptyInline}>{t("loading")}</p> : null}
      {!loading && items.length === 0 ? (
        <p className={ui.emptyInline}>{t(`empty.${tab}`)}</p>
      ) : null}
      {tab === "media" && items.length > 0 ? (
        <div className={styles.grid}>
          {items.map((item) =>
            item.attachment_id ? (
              <SharedImageTile
                key={item.message_id}
                attachmentId={item.attachment_id}
                label={item.file_name ?? t("openImage")}
                onOpen={() => void openDownload(item.attachment_id!)}
              />
            ) : null,
          )}
        </div>
      ) : null}
      {tab === "files" && items.length > 0 ? (
        <ul className={ui.list}>
          {items.map((item) => (
            <li key={item.message_id}>
              <button
                type="button"
                className={ui.listRow}
                onClick={() =>
                  item.attachment_id ? void openDownload(item.attachment_id) : undefined
                }
              >
                <FileText size={24} aria-hidden />
                <span className={ui.listRowBody}>
                  <span className={`${ui.listRowTitle} truncate`}>{item.file_name}</span>
                  {item.size_bytes ? (
                    <span className={ui.listRowSubtitle}>
                      {formatByteSize(Number(item.size_bytes), locale)}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {tab === "links" && items.length > 0 ? (
        <ul className={ui.list}>
          {items.map((item) => (
            <li key={`${item.message_id}-${item.url}`}>
              <a
                className={ui.listRow}
                href={item.url ?? "#"}
                rel="noreferrer noopener"
              >
                <Link2 size={24} aria-hidden />
                <span className={ui.listRowBody}>
                  <span className={`${ui.listRowTitle} truncate handle`}>{item.url}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {hasMore ? (
        <button
          type="button"
          className={`${ui.btn} ${ui.btnSecondary}`}
          onClick={() => void load(tab, cursor, true)}
          disabled={loading}
        >
          {t("loadMore")}
        </button>
      ) : null}
    </div>
  );
}

export const SharedMediaBrowser = SharedMediaBrowserInner;
