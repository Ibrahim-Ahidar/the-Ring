import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  net,
  Notification,
  screen,
  session,
  shell,
  safeStorage,
  Tray,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from "electron";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { autoUpdater } from "electron-updater";
import { parseNotifyPayload, parseUnreadCount, trayTooltip } from "./bridge-validation";
import { shouldHideOnClose } from "./close-policy";
import { createLocalDbService, type DbDriver } from "./local-db";
import { getOrCreateLocalStorageKey } from "./local-storage-key";
import { isOfflineError } from "./offline";
import { isPulseUrl } from "./origin";
import { createRetryController } from "./retry-controller";
import { TITLE_BAR_HEIGHT, isLandingUrl, parseTitleBarColors, startUrl } from "./title-bar";
import { shouldCheckForUpdates } from "./update-policy";
import { buildTrayMenu } from "./tray-menu";
import {
  parseWindowState,
  sanitizeForDisplays,
  serializeWindowState,
  type WindowState,
} from "./window-state";

// Production web app (Vercel project the-ring); override with PULSE_URL.
const DEFAULT_PULSE_URL = "https://the-ring-five.vercel.app";
const PULSE_URL = process.env.PULSE_URL || DEFAULT_PULSE_URL;
const START_URL = startUrl(PULSE_URL);
const APP_ICON = path.join(__dirname, "..", "assets", "icon.png");
const OFFLINE_PAGE = path.join(__dirname, "..", "assets", "offline.html");
const RETRY_SCHEME = "pulse-retry:";

app.setAppUserModelId("com.pulse.desktop");

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

function showWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function refreshTrayMenu(): void {
  if (!tray) return;
  const menu = buildTrayMenu({
    loginEnabled: app.getLoginItemSettings().openAtLogin,
    onOpen: showWindow,
    onToggleLogin: (enabled) => {
      app.setLoginItemSettings({ openAtLogin: enabled });
      refreshTrayMenu();
    },
    onQuit: () => {
      isQuitting = true;
      app.quit();
    },
  });
  tray.setContextMenu(Menu.buildFromTemplate(menu));
}

function setupTray(): void {
  const icon = nativeImage.createFromPath(path.join(__dirname, "..", "assets", "tray.png"));
  tray = new Tray(icon);
  tray.setToolTip("Pulse");
  tray.on("click", showWindow);
  refreshTrayMenu();
}

/** Only frames on the Pulse origin may use the bridge. */
function fromPulseFrame(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  const url = event.senderFrame?.url ?? "";
  return isPulseUrl(url, PULSE_URL);
}

function badgeImage(): Electron.NativeImage {
  // 16x16 solid red dot as a BGRA bitmap with a circular alpha mask.
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if ((x - c) ** 2 + (y - c) ** 2 <= (size / 2 - 0.5) ** 2) {
        buf[i] = 0x3b;
        buf[i + 1] = 0x30;
        buf[i + 2] = 0xe5;
        buf[i + 3] = 0xff;
      }
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

function applyUnread(count: number): void {
  app.setBadgeCount(count);
  tray?.setToolTip(trayTooltip(count));
  if (process.platform === "win32" && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setOverlayIcon(count > 0 ? badgeImage() : null, count > 0 ? `${count} unread` : "");
  }
}

function localKeyFile(): string {
  return path.join(app.getPath("userData"), "crypto-key.bin");
}

function readLocalStorageKey(): string | null {
  const file = localKeyFile();
  return getOrCreateLocalStorageKey({
    safeStorage,
    read: () => (fs.existsSync(file) ? fs.readFileSync(file) : null),
    write: (data) => fs.writeFileSync(file, data),
    randomBytes: (n) => crypto.randomBytes(n),
  });
}

// The local SQLite file (spec D11). Nothing is opened until the page's first request, and the
// page only makes requests while the e2ee flag is on.
const localDb = createLocalDbService({
  get file() {
    return path.join(app.getPath("userData"), "pulse-local.db");
  },
  getKey: readLocalStorageKey,
  deleteKey: () => fs.rmSync(localKeyFile(), { force: true }),
  open: (file) => {
    // Loaded lazily: the native module is only needed once the flag is on.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3-multiple-ciphers") as new (f: string) => DbDriver;
    return new Database(file);
  },
  removeFile: (p) => fs.rmSync(p, { force: true }),
});

function setupBridge(): void {
  ipcMain.handle("pulse:local-storage-key", (event) => {
    if (!fromPulseFrame(event)) return null;
    return readLocalStorageKey();
  });
  ipcMain.handle("pulse:local-db", (event, raw) => {
    if (!fromPulseFrame(event)) return { ok: false, error: "forbidden" };
    return localDb.handle(raw);
  });
  ipcMain.on("pulse:notify", (event, raw) => {
    if (!fromPulseFrame(event)) return;
    const payload = parseNotifyPayload(raw);
    if (!payload || !Notification.isSupported()) return;
    const n = new Notification({ title: payload.title, body: payload.body, silent: false });
    n.on("click", () => {
      showWindow();
      mainWindow?.webContents.send("pulse:open-chat", payload.chatId);
    });
    n.show();
  });
  ipcMain.on("pulse:set-unread", (event, raw) => {
    if (!fromPulseFrame(event)) return;
    const count = parseUnreadCount(raw);
    if (count !== null) applyUnread(count);
  });
  ipcMain.on("pulse:title-bar-colors", (event, raw) => {
    if (!fromPulseFrame(event)) return;
    const colors = parseTitleBarColors(raw);
    if (!colors || !mainWindow || process.platform === "darwin") return;
    mainWindow.setTitleBarOverlay({ ...colors, height: TITLE_BAR_HEIGHT });
  });
}

function stateFile(): string {
  return path.join(app.getPath("userData"), "window-state.json");
}

function loadState(): WindowState {
  let raw: string | null = null;
  try {
    raw = fs.readFileSync(stateFile(), "utf8");
  } catch {
    /* first run */
  }
  const displays = screen.getAllDisplays().map((d) => d.workArea);
  return sanitizeForDisplays(parseWindowState(raw), displays);
}

function watchState(win: BrowserWindow): void {
  let timer: NodeJS.Timeout | undefined;
  const save = () => {
    clearTimeout(timer);
    timer = undefined;
    if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
    const b = win.getNormalBounds();
    const state: WindowState = {
      width: b.width,
      height: b.height,
      x: b.x,
      y: b.y,
      maximised: win.isMaximized(),
    };
    try {
      fs.writeFileSync(stateFile(), serializeWindowState(state));
    } catch {
      /* non-fatal */
    }
  };
  const debounced = () => {
    clearTimeout(timer);
    timer = setTimeout(save, 500);
  };
  win.on("resize", debounced);
  win.on("move", debounced);
  win.on("maximize", debounced);
  win.on("unmaximize", debounced);
  win.on("close", save);
}

function openExternal(url: string): void {
  // Only hand web links to the OS; never file:, javascript:, custom schemes.
  if (/^(https?|mailto):/i.test(url)) void shell.openExternal(url);
}

function createWindow(): BrowserWindow {
  const state = loadState();
  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    show: false,
    title: "Pulse",
    icon: APP_ICON,
    // Frameless look: the preload draws the bar, the OS keeps its window buttons.
    titleBarStyle: "hidden",
    ...(process.platform === "darwin"
      ? {}
      : { titleBarOverlay: { color: "#f6f7f9", symbolColor: "#0a0a0a", height: TITLE_BAR_HEIGHT } }),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.js"),
      // No `partition`: default session, so Supabase cookies persist.
    },
  });
  if (state.maximised) win.maximize();
  win.once("ready-to-show", () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isPulseUrl(url, PULSE_URL)) return { action: "allow" };
    openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(RETRY_SCHEME)) {
      event.preventDefault();
      void retry.retryNow();
      return;
    }
    if (isLandingUrl(url, PULSE_URL)) {
      event.preventDefault();
      void win.loadURL(START_URL);
      return;
    }
    if (isPulseUrl(url, PULSE_URL)) return;
    event.preventDefault();
    openExternal(url);
  });

  watchState(win);
  win.on("close", (event) => {
    if (shouldHideOnClose({ isQuitting })) {
      event.preventDefault();
      win.hide();
    }
  });

  const showOffline = () => {
    void win.loadFile(OFFLINE_PAGE);
    retry.start();
  };
  const retry = createRetryController({
    probe: async () => {
      try {
        const res = await net.fetch(PULSE_URL, { method: "HEAD", bypassCustomProtocolHandlers: true });
        return res.status > 0;
      } catch {
        return false;
      }
    },
    onOnline: () => {
      if (!win.isDestroyed()) void win.loadURL(START_URL);
    },
    setTimer: (fn, ms) => setTimeout(fn, ms),
    clearTimer: (h) => clearTimeout(h as NodeJS.Timeout),
  });
  win.webContents.on("did-fail-load", (_e, errorCode, _desc, validatedURL, isMainFrame) => {
    // Failures of the offline page itself are ignored; retry keeps running.
    if (!isMainFrame || validatedURL.startsWith("file:") || !isOfflineError(errorCode)) return;
    showOffline();
  });
  // Client-side links to "/" never hit will-navigate; catch them after the fact.
  win.webContents.on("did-navigate-in-page", (_e, url, isMainFrame) => {
    if (isMainFrame && isLandingUrl(url, PULSE_URL)) void win.loadURL(START_URL);
  });
  win.webContents.on("did-navigate", (_e, url) => {
    if (isLandingUrl(url, PULSE_URL)) void win.loadURL(START_URL);
  });
  win.on("focus", () => void retry.retryNow());
  win.on("closed", retry.stop);
  void win.loadURL(START_URL);
  win.on("closed", () => {
    mainWindow = null;
  });
  return win;
}

function setupPermissions(): void {
  const allowed = new Set(["media", "notifications"]);
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, permission, callback) => {
    callback(allowed.has(permission) && isPulseUrl(wc.getURL(), PULSE_URL));
  });
  ses.setPermissionCheckHandler(
    (_wc, permission, requestingOrigin) =>
      allowed.has(permission) && isPulseUrl(requestingOrigin, PULSE_URL),
  );
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", showWindow);
  void app.whenReady().then(() => {
    // Drop the default File/Edit/View/Window menu bar; the web app has its own UI.
    Menu.setApplicationMenu(null);
    setupPermissions();
    setupBridge();
    mainWindow = createWindow();
    setupTray();
    if (shouldCheckForUpdates({ isPackaged: app.isPackaged, env: process.env })) {
      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        console.warn("update check failed:", err instanceof Error ? err.message : err);
      });
    }
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
    });
  });
  app.on("before-quit", () => {
    localDb.close();
    isQuitting = true;
  });
  // Stay alive in the tray when the window is closed; Quit exits explicitly.
  app.on("window-all-closed", () => {
    if (!tray) app.quit();
  });
}
