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
