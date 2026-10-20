import { app, BrowserWindow, screen, session, shell } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import { isPulseUrl } from "./origin";
import {
  parseWindowState,
  sanitizeForDisplays,
  serializeWindowState,
  type WindowState,
} from "./window-state";

// No production URL exists in the repo yet; override with PULSE_URL.
const DEFAULT_PULSE_URL = "https://pulse.vercel.app";
const PULSE_URL = process.env.PULSE_URL || DEFAULT_PULSE_URL;

app.setAppUserModelId("com.pulse.desktop");

let mainWindow: BrowserWindow | null = null;

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
    if (isPulseUrl(url, PULSE_URL)) return;
    event.preventDefault();
    openExternal(url);
  });

  watchState(win);
  // Seam (#168): did-fail-load -> offline screen. Seam (#166): close -> hide to tray.
  void win.loadURL(PULSE_URL);
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
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  void app.whenReady().then(() => {
    setupPermissions();
    mainWindow = createWindow();
    // Seams: #166 tray, #167 IPC bridge, #169 updater hook in here.
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
    });
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
