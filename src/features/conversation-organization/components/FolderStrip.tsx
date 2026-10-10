"use client";

import { Archive, FolderPlus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { memo, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

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

  const showFolderHint =
    activeFolderId != null && sorted.some((f) => f.id === activeFolderId);

  return (
    <div className={styles.strip}>
      <div className={ui.chips} role="toolbar" aria-label={t("folderToolbar")}>
        <button
          type="button"
          className={ui.chip}
          aria-pressed={!activeFolderId && !archived}
          onClick={() => navigate({ folder: null, archived: false })}
        >
          {t("allChats")}
        </button>
        {sorted.map((folder) => (
          <button
            key={folder.id}
            type="button"
            className={ui.chip}
            aria-pressed={activeFolderId === folder.id}
            onClick={() => navigate({ folder: folder.id })}
          >
            {folder.name}
          </button>
        ))}
        <button
          type="button"
          className={ui.chip}
          aria-pressed={archived}
          onClick={() => navigate({ archived: true })}
        >
          <Archive size={16} aria-hidden />
          {t("archivedChats")}
        </button>
        <button
          type="button"
          className={`${ui.chip} ${ui.chipIcon}`}
          aria-label={t("createFolder")}
          title={t("newFolder")}
          onClick={() => requestFolderDialog({ kind: "create" })}
        >
          <FolderPlus size={16} aria-hidden />
        </button>
      </div>
      {showFolderHint ? (
        <p className={styles.hint} id="folder-empty-hint">
          {t("folderEmptyHint")}
        </p>
      ) : null}
      {folders.length === 0 ? <p className={styles.hint}>{t("noFoldersYet")}</p> : null}
    </div>
  );
});
