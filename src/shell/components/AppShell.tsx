"use client";

import { memo, type ReactNode } from "react";

import { ShellProvider, useShell } from "@/shell/context/ShellContext";
import { ShellOverlays } from "./ShellOverlays";
import { SkipLink } from "./SkipLink";

function AppShellBody({ children }: { children: ReactNode }) {
  const { rightPaneOpen, rightPaneContent } = useShell();

  return (
    <div className="shell-root">
      <SkipLink />
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

export const AppShell = memo(AppShellInner);
