import { describe, expect, it, vi } from "vitest";
import { buildTrayMenu } from "./tray-menu";
import { shouldHideOnClose } from "./close-policy";

describe("shouldHideOnClose", () => {
  it("hides when not quitting", () => expect(shouldHideOnClose({ isQuitting: false })).toBe(true));
  it("lets close through when quitting", () =>
    expect(shouldHideOnClose({ isQuitting: true })).toBe(false));
});

describe("buildTrayMenu", () => {
  const make = (loginEnabled: boolean) => {
    const onOpen = vi.fn();
    const onToggleLogin = vi.fn();
    const onQuit = vi.fn();
    return { onOpen, onToggleLogin, onQuit, menu: buildTrayMenu({ loginEnabled, onOpen, onToggleLogin, onQuit }) };
  };
  it("has Open, Launch at login, Quit in order", () => {
    const { menu } = make(false);
    expect(menu.map((m) => m.label ?? m.type)).toEqual(["Open Pulse", "Launch at login", "separator", "Quit"]);
  });
  it("reflects loginEnabled in the checkbox", () => {
    expect(make(true).menu[1]).toMatchObject({ type: "checkbox", checked: true });
    expect(make(false).menu[1]).toMatchObject({ checked: false });
  });
  it("wires callbacks", () => {
    const t = make(false);
    t.menu[0].click!({ checked: false });
    t.menu[1].click!({ checked: true });
    t.menu[3].click!({ checked: false });
    expect(t.onOpen).toHaveBeenCalledOnce();
    expect(t.onToggleLogin).toHaveBeenCalledWith(true);
    expect(t.onQuit).toHaveBeenCalledOnce();
  });
});
