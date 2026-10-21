"use client";

import { FolderPlus } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { memo, useCallback, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useLocale, useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

import { requestFolderDialog } from "../organization-events";
import type { ChatFolder } from "../types";
import { FolderMenuSheet } from "./FolderMenuSheet";

type Props = {
  folders: ChatFolder[];
  /** Called after a folder was reordered or deleted, to reload the folder list. */
  onFoldersChanged?: () => void;
};

type BuiltIn = "unread" | "groups";

const LONG_PRESS_MS = 500;
const RTL_LOCALES = new Set(["ar", "he", "fa", "ur"]);

/**
 * The single chip row of the chat list: All · Unread · Groups · folders · +.
 * Exactly one chip is active. The choice lives in the URL (`?filter=unread|groups`
 * or `?folder=<id>`); picking a chip clears the other params. Folder chips open
 * a menu on right-click, long-press, the context-menu key or Shift+F10.
 */
export const FolderStrip = memo(function FolderStrip({ folders, onFoldersChanged }: Props) {
  const t = useTranslations("conversation-organization");
  const rtl = RTL_LOCALES.has(useLocale());
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [menuFolder, setMenuFolder] = useState<ChatFolder | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);

  const sorted = useMemo(
    () => [...folders].sort((a, b) => a.position - b.position),
    [folders],
  );

  const folderParam = searchParams.get("folder");
  const filterParam = searchParams.get("filter");
  const activeFolderId =
    folderParam && sorted.some((f) => f.id === folderParam) ? folderParam : null;
  const activeBuiltIn: BuiltIn | null =
    activeFolderId === null && (filterParam === "unread" || filterParam === "groups")
      ? filterParam
      : null;
  const allActive = activeFolderId === null && activeBuiltIn === null;

  const select = useCallback(
    (choice: { filter?: BuiltIn; folder?: string }) => {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("archived");
      next.delete("folder");
      next.delete("filter");
      if (choice.filter) {
        next.set("filter", choice.filter);
      }
      if (choice.folder) {
        next.set("folder", choice.folder);
      }
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const clearPress = useCallback(() => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }, []);

  const handleChanged = useCallback(
    (change: { deletedId?: string }) => {
      onFoldersChanged?.();
      if (change.deletedId && change.deletedId === searchParams.get("folder")) {
        select({});
      }
    },
    [onFoldersChanged, searchParams, select],
  );

  const onFolderKeyDown = (event: KeyboardEvent, folder: ChatFolder) => {
    if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      setMenuFolder(folder);
    }
  };

  const builtIn = (key: "all" | BuiltIn, label: string, active: boolean) => (
    <button
      type="button"
      className={ui.chip}
      aria-pressed={active}
      onClick={() => select(key === "all" ? {} : { filter: key })}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className={ui.chips} role="toolbar" aria-label={t("folderToolbar")}>
        {builtIn("all", t("filterAll"), allActive)}
        {builtIn("unread", t("filterUnread"), activeBuiltIn === "unread")}
        {builtIn("groups", t("filterGroups"), activeBuiltIn === "groups")}
        {sorted.map((folder) => (
          <button
            key={folder.id}
            type="button"
            className={ui.chip}
            aria-pressed={activeFolderId === folder.id}
            aria-haspopup="dialog"
            aria-keyshortcuts="Shift+F10"
            onClick={() => {
              if (suppressClick.current) {
                suppressClick.current = false;
                return;
              }
              select({ folder: folder.id });
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenuFolder(folder);
            }}
            onKeyDown={(event) => onFolderKeyDown(event, folder)}
            onPointerDown={(event) => {
              if (event.pointerType === "mouse") {
                return;
              }
              clearPress();
              pressTimer.current = setTimeout(() => {
                pressTimer.current = null;
                suppressClick.current = true;
                setMenuFolder(folder);
              }, LONG_PRESS_MS);
            }}
            onPointerUp={clearPress}
            onPointerLeave={clearPress}
            onPointerCancel={clearPress}
          >
            {folder.name}
          </button>
        ))}
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
      {menuFolder ? (
        <FolderMenuSheet
          folder={menuFolder}
          folders={sorted}
          rtl={rtl}
          onClose={() => setMenuFolder(null)}
          onChanged={handleChanged}
        />
      ) : null}
    </>
  );
});
