import { contextBridge } from "electron";

// Bridge grows in #167 (notify, setBadge, focus, onNotificationClick).
contextBridge.exposeInMainWorld("pulseDesktop", { version: "0.1.0" });
