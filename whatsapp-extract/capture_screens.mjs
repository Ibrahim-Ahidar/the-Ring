import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PORT = process.env.CDP_PORT ?? 9222;
const OUT = join(import.meta.dirname, "live", "screens");

const byLabel = (label) => `document.querySelector('[aria-label="${label}"]')`;

// Opens the self chat only: opening chats with unread messages would send read receipts.
const SCREENS = [
  { name: "chat-list", target: byLabel("Chats") },
  {
    name: "chat",
    target: `[...document.querySelectorAll('[role=gridcell]')].find((c) => c.textContent.includes('(You)'))`,
  },
  { name: "chat-contact-info", target: `document.querySelector('#main header')`, offsetX: 150 },
  { name: "calls", target: byLabel("Calls"), escape: true },
  { name: "status", target: byLabel("Status") },
  { name: "channels", target: byLabel("Channels") },
  { name: "communities", target: byLabel("Communities") },
  { name: "archived", target: byLabel("Archived") },
  { name: "media", target: byLabel("Media"), wait: 8000 },
  { name: "profile", target: byLabel("You"), escape: true },
  { name: "menu", target: byLabel("Chats"), then: byLabel("Menu") },
].filter((s) => !process.env.ONLY || process.env.ONLY.split(",").includes(s.name));

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const page = targets.find((t) => t.type === "page" && t.url.includes("whatsapp"));
if (!page) throw new Error("No WhatsApp page target found");

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});

let nextId = 1;
const pending = new Map();
const sheets = new Map();
ws.onmessage = ({ data }) => {
  const msg = JSON.parse(data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) {
      reject(new Error(msg.error.message));
    } else {
      resolve(msg.result);
    }
  } else if (msg.method === "CSS.styleSheetAdded") {
    sheets.set(msg.params.header.styleSheetId, msg.params.header);
  }
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (expression) =>
  (await send("Runtime.evaluate", { expression, returnByValue: true })).result.value;

async function click(targetExpr, offsetX) {
  const rect = await evaluate(`(() => {
    const el = ${targetExpr};
    if (!el) return null;
    el.scrollIntoView({ block: "center" });
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  })()`);
  if (!rect) return false;
  const x = offsetX ? rect.x + Math.min(offsetX, rect.w / 2) : rect.x + rect.w / 2;
  const y = rect.y + rect.h / 2;
  for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
    await send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
  }
  return true;
}

async function pressEscape() {
  for (const type of ["keyDown", "keyUp"]) {
    await send("Input.dispatchKeyEvent", { type, key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  }
}

const cleanedHtml = () =>
  evaluate(`(() => {
    const root = document.documentElement.cloneNode(true);
    root.querySelectorAll("script, style, link[rel=stylesheet], link[rel=preload], link[rel=modulepreload], noscript").forEach((n) => n.remove());
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "../all.css";
    root.querySelector("head").appendChild(link);
    const script = document.createElement("script");
    script.src = "../scroll-to-latest.js";
    root.querySelector("head").appendChild(script);
    return "<!DOCTYPE html>\\n" + root.outerHTML;
  })()`);

await send("DOM.enable");
await send("CSS.enable");
await send("Page.enable");
await sleep(1500);
await mkdir(OUT, { recursive: true });

for (const screen of SCREENS) {
  if (screen.escape) {
    await pressEscape();
    await sleep(500);
  }
  if (!(await click(screen.target, screen.offsetX))) {
    console.log(`skip  ${screen.name} (element not found)`);
    continue;
  }
  await sleep(screen.wait ?? 2500);
  if (screen.then) {
    if (!(await click(screen.then))) {
      console.log(`skip  ${screen.name} (second element not found)`);
      continue;
    }
    await sleep(1500);
  }
  const html = await cleanedHtml();
  await writeFile(join(OUT, `${screen.name}.html`), html);
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  await writeFile(join(OUT, `${screen.name}.png`), Buffer.from(data, "base64"));
  console.log(`saved ${screen.name} (${html.length} chars)`);
  if (screen.then) await pressEscape();
}

await pressEscape();
await click(byLabel("Chats"));

const cssParts = [];
for (const [id, header] of sheets) {
  const { text } = await send("CSS.getStyleSheetText", { styleSheetId: id });
  const src = header.isInline ? "inline-style" : header.isConstructed ? "constructed" : header.sourceURL || "unknown";
  cssParts.push(`/* ===== ${src} (${header.origin}) ===== */\n${text}`);
}
const allCss = cssParts.join("\n\n");
await writeFile(join(OUT, "..", "all.css"), allCss);
console.log(`stylesheets: ${sheets.size}, CSS total: ${allCss.length} chars`);
ws.close();
