"use client";

import { memo, useEffect } from "react";
import { useRouter } from "next/navigation";

import { useAppearanceDispatch } from "@/features/locale-appearance/context/AppearanceContext";
import { findMatchingShortcut } from "@/features/locale-appearance/shortcuts";

const NAV_TARGETS: Record<string, string> = {
  chats: "/app/chats",
  settings: "/app/settings/account",
};

function GlobalKeyboardShortcutsInner() {
  const dispatch = useAppearanceDispatch();
  const router = useRouter();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = findMatchingShortcut(event);
      if (!shortcut) {
        return;
      }

      event.preventDefault();

      if (shortcut.id === "palette") {
        dispatch({ type: "open_palette" });
        return;
      }

      if (shortcut.id === "help") {
        dispatch({ type: "open_help" });
        return;
      }

      const href = NAV_TARGETS[shortcut.id];
      if (href) {
        router.push(href);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dispatch, router]);

  return null;
}

export const GlobalKeyboardShortcuts = memo(GlobalKeyboardShortcutsInner);
