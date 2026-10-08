"use client";

import { FolderPlus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { memo, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";

import { requestFolderDialog } from "../organization-events";
import type { ChatFolder } from "../types";
import styles from "../conversation-organization.module.css";

type Props = {
  folders: ChatFolder[];
};

export const FolderStrip = memo(function FolderStrip({ folders }: Props) {
  const t = useTranslations("conversation-organization");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeFolderId = searchParams.get("folder");
  const archived = searchParams.get("archived") === "1";

  const navigate = useCallback(
    (params: { folder?: string | null; archived?: boolean }) => {
      const next = new URLSearchParams(searchParams.toString());
      if (params.folder === null) {
        next.delete("folder");
      } else if (params.folder) {
        next.set("folder", params.folder);
        next.delete("archived");
      }
      if (params.archived) {
        next.set("archived", "1");
        next.delete("folder");
      } else if (params.archived === false) {
        next.delete("archived");
      }
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const sorted = useMemo(
    () => [...folders].sort((a, b) => a.position - b.position),
    [folders],
  );

  return (
    <div className={styles.strip} role="toolbar" aria-label={t("folderToolbar")}>
      <button
        type="button"
        className={styles.stripChip}
        data-active={!activeFolderId && !archived ? "true" : "false"}
        onClick={() => navigate({ folder: null, archived: false })}
      >
        {t("allChats")}
      </button>
      <button
        type="button"
        className={styles.stripChip}
        data-active={archived ? "true" : "false"}
        onClick={() => navigate({ archived: true })}
      >
        {t("archivedChats")}
      </button>
      {sorted.map((folder) => (
        <button
          key={folder.id}
          type="button"
          className={styles.stripChip}
          data-active={activeFolderId === folder.id ? "true" : "false"}
          onClick={() => navigate({ folder: folder.id })}
        >
          {folder.name}
        </button>
      ))}
      <div className={styles.stripActions}>
        <button
          type="button"
          className={styles.stripChip}
          aria-label={t("createFolder")}
          onClick={() => requestFolderDialog({ kind: "create" })}
        >
          <FolderPlus size={16} aria-hidden />
          <span>{t("newFolder")}</span>
        </button>
      </div>
      {activeFolderId && sorted.some((f) => f.id === activeFolderId) ? (
        <p className={styles.emptyFolder} id="folder-empty-hint">
          {t("folderEmptyHint")}
        </p>
      ) : null}
      {folders.length === 0 ? (
        <p className={styles.emptyFolder}>{t("noFoldersYet")}</p>
      ) : null}
    </div>
  );
});
