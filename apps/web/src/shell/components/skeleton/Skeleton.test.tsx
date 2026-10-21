import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("../PaneLayout", () => ({ PaneLayout: ({ children }: { children: unknown }) => <main>{children as never}</main> }));

import { ChatListSkeleton, ThreadSkeleton } from "@/features/direct-messaging/components/Skeletons";

import { SinglePaneSkeleton, SettingsSectionSkeleton, SkeletonCard } from "./Skeleton";

describe("skeletons", () => {
  it("renders chat skeletons busy with a hidden label", () => {
    for (const el of [<ChatListSkeleton key="a" label="L1" />, <ThreadSkeleton key="b" label="L2" />]) {
      const html = renderToStaticMarkup(el);
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('class="sr-only"');
    }
  });

  it("renders page frames as async server components", async () => {
    const pane = renderToStaticMarkup(await SinglePaneSkeleton({ children: <SkeletonCard /> }));
    expect(pane).toContain('aria-busy="true"');
    expect(pane).toContain(">loading<");
    const section = renderToStaticMarkup(await SettingsSectionSkeleton({ children: <SkeletonCard /> }));
    expect(section).toContain('aria-busy="true"');
  });
});
