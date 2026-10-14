"use client";

import { usePathname } from "next/navigation";
import { type ReactNode } from "react";

import { ShellProvider, useShell } from "@/shell/context/ShellContext";
import { ShellNavList } from "./ShellNavList";
import { ShellOverlays } from "./ShellOverlays";
import { SkipLink } from "./SkipLink";

const NOT_CONVERSATIONS = new Set(["new", "requests"]);

/**
 * True on screens that show a single open conversation (or its media), where
 * the mobile bottom tab bar gives way to the composer.
 */
export function isConversationRoute(pathname: string): boolean {
  const [app, section, id] = pathname.split("/").filter(Boolean);
  if (app !== "app" || !id) {
    return false;
  }
  if (section === "media") {
    return true;
  }
  return (section === "chats" || section === "groups") && !NOT_CONVERSATIONS.has(id);
}

function AppShellBody({ children }: { children: ReactNode }) {
  const { rightPaneOpen, rightPaneContent } = useShell();
  const pathname = usePathname() ?? "";

  return (
    <div
      className="shell-root"
      data-conversation-open={isConversationRoute(pathname) ? "true" : "false"}
    >
      <SkipLink />
      <ShellNavList />
      <main id="main-content" className="shell-main">
        {children}
      </main>
      {rightPaneOpen ? (
        <aside className="shell-right-pane" data-open="true">
          {rightPaneContent}
        </aside>
      ) : null}
      <ShellOverlays />
    </div>
  );
}

function AppShellInner({ children }: { children: ReactNode }) {
  return (
    <ShellProvider>
      <AppShellBody>{children}</AppShellBody>
    </ShellProvider>
  );
}

export const AppShell = AppShellInner;
