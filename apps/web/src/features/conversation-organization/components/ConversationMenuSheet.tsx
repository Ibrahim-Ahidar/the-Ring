"use client";

import {
  Archive,
  ArchiveRestore,
  Bell,
  BellOff,
  ChevronDown,
  FolderInput,
  FolderMinus,
  Pin,
  PinOff,
} from "lucide-react";
import { memo, useCallback, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";

import type { ListItemMenuContext } from "@/shell/slots/types";
import ui from "@/shell/styles/ui.module.css";

import {
  archiveConversationAction,
  moveToFolderAction,
  muteConversationAction,
  pinConversationAction,
  removeFromFolderAction,
  unarchiveConversationAction,
  unmuteConversationAction,
  unpinConversationAction,
} from "../actions";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { organizationErrorMessage } from "../error-message";
import { isMuted } from "../mute-until";
import type { ChatFolder, MuteDurationKey } from "../types";
import { computeMenuPosition } from "@/features/direct-messaging/components/menuPosition";
import styles from "../conversation-organization.module.css";

type Props = {
  ctx: ListItemMenuContext;
  folders: ChatFolder[];
  onClose: () => void;
};

const MUTE_KEYS: MuteDurationKey[] = ["1h", "8h", "24h", "7d", "forever"];

export const ConversationMenuSheet = memo(function ConversationMenuSheet({
  ctx,
  folders,
  onClose,
}: Props) {
  const t = useTranslations("conversation-organization");
  const trapRef = useFocusTrap(true);
  const [error, setError] = useState<string | null>(null);
  const [showMute, setShowMute] = useState(false);
  const [busy, setBusy] = useState(false);
  const [placement, setPlacement] = useState<
    { top: number; left: number } | "sheet" | null
  >(null);
  const point = ctx.point ?? null;

  useLayoutEffect(() => {
    const panel = trapRef.current;
    if (!panel) {
      return;
    }
    const narrow =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 767px)").matches;
    if (!point || narrow) {
      setPlacement("sheet");
      return;
    }
    const rect = panel.getBoundingClientRect();
    const { top, left } = computeMenuPosition(
      { top: point.y, bottom: point.y, left: point.x, right: point.x },
      { width: rect.width, height: rect.height },
      { width: window.innerWidth, height: window.innerHeight },
      document.documentElement.dir === "rtl" ? "rtl" : "ltr",
    );
    setPlacement({ top, left });
  }, [point, trapRef]);

  useEffect(() => {
    const panel = trapRef.current;
    const onScroll = (event: Event) => {
      if (!(panel && event.target instanceof Node && panel.contains(event.target))) {
        onClose();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, trapRef]);

  const panelStyle =
    placement === null
      ? ({ visibility: "hidden" } as const)
      : placement === "sheet"
        ? undefined
        : { top: placement.top, left: placement.left };

  const pinned = ctx.membership.pinned_at != null;
  const archived = ctx.membership.archived_at != null;
  const muted = isMuted(ctx.membership.muted_until);

  const run = useCallback(
    async (action: () => Promise<{ ok: boolean; error?: { code: string } }>) => {
      setBusy(true);
      setError(null);
      const result = await action();
      setBusy(false);
      if (!result.ok) {
        setError(organizationErrorMessage(t, result.error?.code));
        return;
      }
      onClose();
    },
    [onClose, t],
  );

  return createPortal(
    <>
      <button
        type="button"
        className={styles.menuBackdrop}
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <div
        ref={trapRef}
        className={styles.menuPanel}
        style={panelStyle}
        role="dialog"
        aria-modal="true"
        aria-label={t("menuTitle")}
      >
        {error ? (
          <p className={`${ui.errorText} ${styles.sheetError}`} role="alert">
            {error}
          </p>
        ) : null}
        <ul className={styles.menuList}>
          {archived ? (
            <li>
              <button
                type="button"
                className={ui.menuItem}
                disabled={busy}
                onClick={() =>
                  void run(() => unarchiveConversationAction(ctx.conversationId))
                }
              >
                <ArchiveRestore aria-hidden />
                {t("unarchive")}
              </button>
            </li>
          ) : (
            <>
              <li>
                <button
                  type="button"
                  className={ui.menuItem}
                  disabled={busy}
                  onClick={() =>
                    void run(() =>
                      pinned
                        ? unpinConversationAction(ctx.conversationId)
                        : pinConversationAction(ctx.conversationId),
                    )
                  }
                >
                  {pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />}
                  {pinned ? t("unpin") : t("pin")}
                </button>
              </li>
              <li>
                {muted ? (
                  <button
                    type="button"
                    className={ui.menuItem}
                    disabled={busy}
                    onClick={() =>
                      void run(() => unmuteConversationAction(ctx.conversationId))
                    }
                  >
                    <Bell aria-hidden />
                    {t("unmute")}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className={ui.menuItem}
                      disabled={busy}
                      aria-expanded={showMute}
                      onClick={() => setShowMute((v) => !v)}
                    >
                      <BellOff aria-hidden />
                      <span className={styles.grow}>{t("mute")}</span>
                      <ChevronDown
                        size={16}
                        className={styles.disclosure}
                        data-open={showMute ? "true" : "false"}
                        aria-hidden
                      />
                    </button>
                    {showMute ? (
                      <div className={styles.muteSubmenu}>
                        {MUTE_KEYS.map((key) => (
                          <button
                            key={key}
                            type="button"
                            className={ui.menuItem}
                            disabled={busy}
                            onClick={() =>
                              void run(() =>
                                muteConversationAction({
                                  conversationId: ctx.conversationId,
                                  duration: key,
                                }),
                              )
                            }
                          >
                            {t(`muteDuration.${key}`)}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </>
                )}
              </li>
              <li>
                <button
                  type="button"
                  className={`${ui.menuItem} ${ui.menuItemDanger}`}
                  disabled={busy}
                  onClick={() =>
                    void run(() => archiveConversationAction(ctx.conversationId))
                  }
                >
                  <Archive aria-hidden />
                  {t("archive")}
                </button>
              </li>
            </>
          )}
        </ul>
        {!archived && folders.length > 0 ? (
          <>
            <hr className={ui.menuSep} />
            <p className={`${ui.sectionLabel} ${ui.sectionLabelMuted}`}>
              {t("folderSection")}
            </p>
            <ul className={styles.menuList}>
              {folders.map((folder) => (
                <li key={folder.id}>
                  <button
                    type="button"
                    className={ui.menuItem}
                    disabled={busy}
                    onClick={() =>
                      void run(() =>
                        moveToFolderAction({
                          conversationId: ctx.conversationId,
                          folderId: folder.id,
                        }),
                      )
                    }
                  >
                    <FolderInput aria-hidden />
                    {t("moveToFolder", { name: folder.name })}
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  className={ui.menuItem}
                  disabled={busy}
                  onClick={() =>
                    void run(() => removeFromFolderAction(ctx.conversationId))
                  }
                >
                  <FolderMinus aria-hidden />
                  {t("removeFromFolder")}
                </button>
              </li>
            </ul>
          </>
        ) : null}
      </div>
    </>,
    document.body,
  );
});
