import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChatsPageSkeleton } from "./Skeletons";

describe("ChatsPageSkeleton", () => {
  it("keeps the list skeleton inside the sidebar of the pane frame", () => {
    const html = renderToStaticMarkup(<ChatsPageSkeleton listLabel="L" sidebarLabel="S" />);
    const sidebar = html.indexOf('class="pane-sidebar"');
    expect(html).toContain('data-view="list"');
    expect(sidebar).toBeGreaterThan(-1);
    expect(html.indexOf('aria-busy="true"')).toBeGreaterThan(sidebar);
    expect(html.indexOf('aria-busy="true"')).toBeLessThan(html.indexOf('class="pane-main"'));
  });
});
