import type { ReactNode } from "react";

export type PaneView = "list" | "main" | "drawer";

type PaneLayoutProps = {
  /** Which pane is visible on narrow screens. */
  view: PaneView;
  sidebar?: ReactNode;
  sidebarLabel?: string;
  drawer?: ReactNode;
  drawerLabel?: string;
  mainLabel?: string;
  children: ReactNode;
};

/**
 * Sidebar | main | drawer grid. Without a sidebar the main pane spans the full width.
 */
export function PaneLayout({
  view,
  sidebar,
  sidebarLabel,
  drawer,
  drawerLabel,
  mainLabel,
  children,
}: PaneLayoutProps) {
  const single = !sidebar;

  return (
    <div
      className="pane-app"
      data-view={view}
      data-drawer={drawer ? "open" : "closed"}
      data-single={single ? "true" : "false"}
    >
      {sidebar ? (
        <aside className="pane-sidebar" aria-label={sidebarLabel}>
          {sidebar}
        </aside>
      ) : null}
      <section className="pane-main" aria-label={mainLabel}>
        {children}
      </section>
      {drawer ? (
        <aside className="pane-drawer" aria-label={drawerLabel}>
          {drawer}
        </aside>
      ) : null}
    </div>
  );
}
