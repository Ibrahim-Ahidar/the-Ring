// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { UnreadBadge } from "./UnreadBadge";

const badge = () => screen.queryByLabelText("unread");

function renderBadge(count: number, muted = false) {
  const ui = (c: number, m: boolean) => <UnreadBadge count={c} muted={m} label="unread" />;
  const view = render(ui(count, muted));
  return (c: number, m = muted) => view.rerender(ui(c, m));
}

afterEach(cleanup);

describe("UnreadBadge pop", () => {
  it("does not pop on the initial render", () => {
    renderBadge(3);
    expect(badge()?.getAttribute("data-pop")).toBe("false");
  });

  it("pops on 0 -> n", () => {
    const update = renderBadge(0);
    expect(badge()).toBeNull();
    update(2);
    expect(badge()?.getAttribute("data-pop")).toBe("true");
  });

  it("pops on increase and restarts the animation element", () => {
    const update = renderBadge(1);
    update(2);
    const first = badge();
    expect(first?.getAttribute("data-pop")).toBe("true");
    update(3);
    expect(badge()).not.toBe(first);
    expect(badge()?.getAttribute("data-pop")).toBe("true");
  });

  it("does not pop on decrease", () => {
    const update = renderBadge(5);
    update(2);
    expect(badge()?.getAttribute("data-pop")).toBe("false");
  });

  it("pops the muted badge the same way", () => {
    const update = renderBadge(0, true);
    update(1, true);
    expect(badge()?.getAttribute("data-pop")).toBe("true");
  });
});
