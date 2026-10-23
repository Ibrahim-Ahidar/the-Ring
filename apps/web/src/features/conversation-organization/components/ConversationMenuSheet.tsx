"use client";

import {
  Archive,
  ArchiveRestore,
  Ban,
  Bell,
  BellOff,
  ChevronRight,
  Eraser,
  FolderInput,
  FolderMinus,
  ListPlus,
  LogOut,
  MailCheck,
  MailOpen,
  Pin,
  PinOff,
  Star,
  StarOff,
  Trash2,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";

import { markReadAction } from "@/features/direct-messaging/actions";
import {
  favoriteAction,
  listFavoritesAction,
  unfavoriteAction,
} from "@/features/discovery-contacts/actions";
import { leaveGroupAction } from "@/features/groups/actions";
import { ConfirmDialog } from "@/features/groups/components/ConfirmDialog";
import {
  blockUserAction,
  fetchBlocksAction,
  unblockUserAction,
} from "@/features/safety/actions";
import type { ListItemMenuContext } from "@/shell/slots/types";
import ui from "@/shell/styles/ui.module.css";

import {
  archiveConversationAction,
  clearChatAction,
  setConversationUnreadAction,
  deleteChatAction,
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

type ConfirmKind = "block" | "clear" | "delete" | "exit";
type ActionResult = { ok: boolean; error?: { code: string } };

const MUTE_KEYS: MuteDurationKey[] = ["1h", "8h", "24h", "7d", "forever"];

export const ConversationMenuSheet = memo(function ConversationMenuSheet({
  ctx,
  folders,
  onClose,
}: Props) {
  const t = useTranslations("conversation-organization");
  const router = useRouter();
  const pathname = usePathname();
  const trapRef = useFocusTrap(true);
  const [error, setError] = useState<string | null>(null);
  const [showMute, setShowMute] = useState(false);
  const [showList, setShowList] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [favourite, setFavourite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [placement, setPlacement] = useState<
    { top: number; left: number } | "sheet" | null
  >(null);
  const point = ctx.point ?? null;
  const isGroup = ctx.conversationType === "group";
  const otherUserId = ctx.otherUserId ?? null;
  const otherUsername = ctx.otherUsername ?? null;

  useEffect(() => {
    if (isGroup || !otherUserId) {
      return;
    }
    let live = true;
    void fetchBlocksAction().then((r) => {
      if (live && r?.ok) {
        setBlocked(r.value.some((b) => b.blockedId === otherUserId));
      }
    });
    void listFavoritesAction().then((r) => {
      if (live && r?.ok) {
        setFavourite(r.value.some((f) => f.favoriteUserId === otherUserId));
      }
    });
    return () => {
      live = false;
    };
  }, [isGroup, otherUserId]);

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
  const isUnread = ctx.manualUnread === true || (ctx.unreadCount ?? 0) > 0;

  const run = useCallback(
    async (action: () => Promise<ActionResult>) => {
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

  const toggleUnread = useCallback(async () => {
    if (!isUnread) {
      await run(() =>
        setConversationUnreadAction({ conversationId: ctx.conversationId, unread: true }),
      );
      return;
    }
    await run(async () => {
      const flag = await setConversationUnreadAction({
        conversationId: ctx.conversationId,
        unread: false,
      });
      if (!flag.ok || !ctx.lastMessageId || (ctx.unreadCount ?? 0) === 0) {
        return flag;
      }
      return markReadAction({
        conversationId: ctx.conversationId,
        messageId: ctx.lastMessageId,
      });
    });
  }, [ctx, isUnread, run]);

  const confirmed = useCallback(async () => {
    const kind = confirm;
    setConfirm(null);
    if (kind === "block" && otherUserId) {
      await run(() =>
        blocked ? unblockUserAction(otherUserId) : blockUserAction(otherUserId),
      );
    } else if (kind === "clear") {
      await run(() => clearChatAction(ctx.conversationId));
    } else if (kind === "delete") {
      await run(async () => {
        const result = await deleteChatAction(ctx.conversationId);
        if (result.ok && pathname?.includes(ctx.conversationId)) {
          router.push("/app/chats");
        }
        return result;
      });
    } else if (kind === "exit") {
      await run(async () => {
        const result = await leaveGroupAction(ctx.conversationId);
        if (result.ok) {
          router.push("/app/chats");
        }
        return result;
      });
    }
  }, [blocked, confirm, ctx.conversationId, otherUserId, pathname, router, run]);

  const toggleFavourite = () =>
    run(async () => {
      if (!otherUsername) {
        return { ok: false, error: { code: "organization.not_found" } };
      }
      return favourite ? unfavoriteAction(otherUsername) : favoriteAction(otherUsername);
    });

  const item = (key: string, icon: ReactNode, label: string, onClick: () => void) => (
    <li key={key}>
      <button type="button" className={ui.menuItem} disabled={busy} onClick={onClick}>
        {icon}
        {label}
      </button>
    </li>
  );

  const submenu = (
    key: string,
    icon: ReactNode,
    label: string,
    open: boolean,
    toggle: () => void,
    children: ReactNode,
  ) => (
    <li key={key}>
      <button
        type="button"
        className={ui.menuItem}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        {icon}
        <span className={styles.grow}>{label}</span>
        <ChevronRight
          size={16}
          className={styles.disclosure}
          data-open={open ? "true" : "false"}
          aria-hidden
        />
      </button>
      {open ? <div className={styles.muteSubmenu}>{children}</div> : null}
    </li>
  );

  const muteBody = MUTE_KEYS.map((key) => (
    <button
      key={key}
      type="button"
      className={ui.menuItem}
      disabled={busy}
      onClick={() =>
        void run(() =>
          muteConversationAction({ conversationId: ctx.conversationId, duration: key }),
        )
      }
    >
      {t(`muteDuration.${key}`)}
    </button>
  ));

  const listBody = (
    <>
      {folders.map((folder) => (
        <button
          key={folder.id}
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
          {folder.name}
        </button>
      ))}
      <button
        type="button"
        className={ui.menuItem}
        disabled={busy}
        onClick={() => void run(() => removeFromFolderAction(ctx.conversationId))}
      >
        <FolderMinus aria-hidden />
        {t("removeFromList")}
      </button>
    </>
  );

  return createPortal(
    <>
      {confirm ? (
        <ConfirmDialog
          title={t(`confirm.${confirm}Title`)}
          body={t(`confirm.${confirm}Body`)}
          confirmLabel={t("confirm.confirm")}
          cancelLabel={t("cancel")}
          destructive
          onCancel={() => setConfirm(null)}
          onConfirm={() => void confirmed()}
        />
      ) : null}
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
        style={confirm ? { ...panelStyle, visibility: "hidden" } : panelStyle}
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
          {archived
            ? item("archive", <ArchiveRestore aria-hidden />, t("unarchive"), () =>
                void run(() => unarchiveConversationAction(ctx.conversationId)),
              )
            : item("archive", <Archive aria-hidden />, t("archive"), () =>
                void run(() => archiveConversationAction(ctx.conversationId)),
              )}
          {muted
            ? item("mute", <Bell aria-hidden />, t("unmute"), () =>
                void run(() => unmuteConversationAction(ctx.conversationId)),
              )
            : submenu(
                "mute",
                <BellOff aria-hidden />,
                t("mute"),
                showMute,
                () => setShowMute((v) => !v),
                muteBody,
              )}
          {item(
            "pin",
            pinned ? <PinOff aria-hidden /> : <Pin aria-hidden />,
            pinned ? t("unpin") : t("pin"),
            () =>
              void run(() =>
                pinned
                  ? unpinConversationAction(ctx.conversationId)
                  : pinConversationAction(ctx.conversationId),
              ),
          )}
          {item(
            "unread",
            isUnread ? <MailCheck aria-hidden /> : <MailOpen aria-hidden />,
            isUnread ? t("markRead") : t("markUnread"),
            () => void toggleUnread(),
          )}
          {item(
            "favourite",
            favourite ? <StarOff aria-hidden /> : <Star aria-hidden />,
            favourite ? t("removeFavourite") : t("addFavourite"),
            () => void toggleFavourite(),
          )}
          {submenu(
            "list",
            <ListPlus aria-hidden />,
            t("addToList"),
            showList,
            () => setShowList((v) => !v),
            listBody,
          )}
        </ul>
        <hr className={ui.menuSep} />
        <ul className={styles.menuList}>
          {isGroup
            ? null
            : item("block", <Ban aria-hidden />, blocked ? t("unblock") : t("block"), () =>
                setConfirm("block"),
              )}
          {item("clear", <Eraser aria-hidden />, t("clearChat"), () => setConfirm("clear"))}
          {isGroup
            ? item("exit", <LogOut aria-hidden />, t("exitGroup"), () => setConfirm("exit"))
            : item("delete", <Trash2 aria-hidden />, t("deleteChat"), () =>
                setConfirm("delete"),
              )}
        </ul>
      </div>
    </>,
    document.body,
  );
});
