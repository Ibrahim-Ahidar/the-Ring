"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { memo } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";

import ui from "@/shell/styles/ui.module.css";

import { MessageRequestsProvider } from "../context/MessageRequestsProvider";
import styles from "../message-requests.module.css";
import { MessageRequestsInbox } from "./MessageRequestsInbox";

function MessageRequestsQueryOverlayInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations("message-requests");

  const open =
    pathname === "/app/chats" && searchParams.get("requests") === "1";

  if (!open) {
    return null;
  }

  const onClose = () => {
    router.replace("/app/chats");
  };

  return (
    <div
      className={`${ui.scrim} ${ui.scrimSheet}`}
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div
        className={`${ui.dialog} ${styles.overlayPanel}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="requests-overlay-title"
      >
        <div className={styles.overlayHeader}>
          <h2 id="requests-overlay-title" className={`${ui.dialogTitle} ${styles.overlayTitle}`}>
            {t("pageTitle")}
          </h2>
          <button
            type="button"
            className={ui.iconBtn}
            onClick={onClose}
            aria-label={t("close")}
            title={t("close")}
          >
            <X size={24} aria-hidden />
          </button>
        </div>
        <Link className={ui.linkBtn} href="/app/chats/requests">
          {t("openFullPage")}
        </Link>
        <MessageRequestsProvider
          initialIncoming={[]}
          initialOutgoing={[]}
          initialPendingCount={0}
        >
          <MessageRequestsInbox />
        </MessageRequestsProvider>
      </div>
    </div>
  );
}

export const MessageRequestsQueryOverlay = memo(MessageRequestsQueryOverlayInner);
