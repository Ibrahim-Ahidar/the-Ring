import { contextBridge, ipcRenderer } from "electron";

type OpenChatHandler = (chatId: string) => void;

contextBridge.exposeInMainWorld("pulseDesktop", {
  version: "0.1.0",
  notify(payload: { chatId: string; title: string; body: string }): void {
    ipcRenderer.send("pulse:notify", payload);
  },
  setUnreadCount(count: number): void {
    ipcRenderer.send("pulse:set-unread", count);
  },
  onOpenChat(cb: OpenChatHandler): () => void {
    const listener = (_e: unknown, chatId: unknown) => {
      if (typeof chatId === "string") cb(chatId);
    };
    ipcRenderer.on("pulse:open-chat", listener);
    return () => {
      ipcRenderer.removeListener("pulse:open-chat", listener);
    };
  },
});

// Custom title bar: the window is frameless, so draw a draggable strip that follows the
// app theme, and tell the main process which colours to give the native window buttons.
const TITLE_BAR_HEIGHT = 36;
const TITLE_BAR_CSS = `
#pulse-titlebar {
  position: fixed; inset: 0 0 auto 0; z-index: 2147483647;
  height: ${TITLE_BAR_HEIGHT}px;
  padding-right: calc(100vw - env(titlebar-area-width, 100vw));
  display: flex; align-items: center; gap: 8px; padding-left: 12px;
  background: var(--color-bg, #f6f7f9); color: var(--color-text, #0a0a0a);
  font: 600 12px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
  -webkit-app-region: drag; user-select: none;
}
#pulse-titlebar svg { width: 16px; height: 16px; flex: none; }
body { box-sizing: border-box; padding-top: ${TITLE_BAR_HEIGHT}px; }
:root { --desktop-titlebar: ${TITLE_BAR_HEIGHT}px; }
.shell-root { height: calc(100dvh - ${TITLE_BAR_HEIGHT}px) !important; }
`;
const LOGO_SVG =
  '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#4f46e5"/>' +
  '<circle cx="15" cy="17" r="8" fill="none" stroke="#fff" stroke-width="3.5"/>' +
  '<circle cx="23" cy="9" r="3" fill="#fff"/></svg>';

function syncTitleBarColors(bar: HTMLElement): void {
  const style = getComputedStyle(bar);
  ipcRenderer.send("pulse:title-bar-colors", {
    color: style.backgroundColor,
    symbolColor: style.color,
  });
}

function mountTitleBar(): void {
  if (location.protocol === "file:" || document.getElementById("pulse-titlebar")) return;
  const css = document.createElement("style");
  css.textContent = TITLE_BAR_CSS;
  document.head.appendChild(css);
  const bar = document.createElement("div");
  bar.id = "pulse-titlebar";
  bar.innerHTML = `${LOGO_SVG}<span>Pulse</span>`;
  document.body.appendChild(bar);
  syncTitleBarColors(bar);
  // Theme switches flip data-theme on <html> or follow the OS.
  new MutationObserver(() => syncTitleBarColors(bar)).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "class", "style"],
  });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () =>
    syncTitleBarColors(bar),
  );
}

window.addEventListener("DOMContentLoaded", mountTitleBar);
