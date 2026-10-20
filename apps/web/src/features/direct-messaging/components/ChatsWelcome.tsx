"use client";

import Link from "next/link";
import { Keyboard, MessageSquarePlus, Users } from "lucide-react";
import { memo, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { BrandMark } from "@/shell/components/BrandMark";
import ui from "@/shell/styles/ui.module.css";

import styles from "../direct-messaging.module.css";

function usePaletteModifier(): string {
  const [modifier, setModifier] = useState("Ctrl");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) {
      setModifier("⌘");
    }
  }, []);
  return modifier;
}

function ChatsWelcomeInner() {
  const t = useTranslations("direct-messaging");
  const modifier = usePaletteModifier();

  return (
    <section className={ui.emptyState} aria-labelledby="chats-welcome-title">
      <div className={ui.emptyStateArt}>
        <BrandMark size={56} />
      </div>
      <h2 id="chats-welcome-title" className={ui.emptyStateTitle}>
        {t("welcomeTitle")}
      </h2>
      <p className={ui.emptyStateText}>{t("welcomeText")}</p>
      <div className={styles.quickActions}>
        <Link className={styles.quickAction} href="/app/chats/new">
          <span className={styles.quickActionIcon} aria-hidden>
            <MessageSquarePlus size={24} />
          </span>
          {t("newChat")}
        </Link>
        <Link className={styles.quickAction} href="/app/groups/new">
          <span className={styles.quickActionIcon} aria-hidden>
            <Users size={24} />
          </span>
          {t("newGroup")}
        </Link>
      </div>
      <p className={styles.welcomeFoot}>
        <Keyboard size={16} aria-hidden />
        {t.rich("paletteHint", {
          keys: () => (
            <>
              <kbd className={ui.kbd}>{modifier}</kbd> <kbd className={ui.kbd}>K</kbd>
            </>
          ),
        })}
      </p>
    </section>
  );
}

export const ChatsWelcome = memo(ChatsWelcomeInner);
