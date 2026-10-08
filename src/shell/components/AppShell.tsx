"use client";

import { memo, type ReactNode } from "react";

import { ShellProvider, useShell } from "@/shell/context/ShellContext";
import { MobileBackBar } from "./MobileBackBar";
import { ShellNavRail } from "./ShellNavRail";
import { ShellOverlays } from "./ShellOverlays";
import { SkipLink } from "./SkipLink";

import "@/shell/styles/shell.css";

function AppShellBody({ children }: { children: ReactNode }) {
  const { rightPaneOpen, rightPaneContent } = useShell();

  return (
    <div className="shell-root">
      <SkipLink />
      <ShellNavRail />
      <div className="shell-main-wrap">
        <MobileBackBar />
        <main id="main-content" className="shell-main">
          {children}
        </main>
      </div>
      <aside
        className="shell-right-pane"
        data-open={rightPaneOpen ? "true" : "false"}
        aria-hidden={!rightPaneOpen}
      >
        {rightPaneContent}
      </aside>
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
