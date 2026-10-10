import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PORT = process.env.CDP_PORT ?? 9222;
const OUT = join(import.meta.dirname, "live");

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const page = targets.find((t) => t.type === "page" && t.url.includes("whatsapp"));
if (!page) throw new Error("No WhatsApp page target found:\n" + JSON.stringify(targets, null, 2));
console.log("Target:", page.url);

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

await send("DOM.enable");
await send("CSS.enable");
await new Promise((r) => setTimeout(r, 1500));

const { result } = await send("Runtime.evaluate", {
  expression: "'<!DOCTYPE html>\\n' + document.documentElement.outerHTML",
  returnByValue: true,
});
const html = result.value;

const { result: cleaned } = await send("Runtime.evaluate", {
  expression: `(() => {
    const root = document.documentElement.cloneNode(true);
    root.querySelectorAll("script, style, link[rel=stylesheet], link[rel=preload], link[rel=modulepreload], noscript").forEach((n) => n.remove());
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "all.css";
    root.querySelector("head").appendChild(link);
    return "<!DOCTYPE html>\\n" + root.outerHTML;
  })()`,
  returnByValue: true,
});

await mkdir(join(OUT, "css"), { recursive: true });
await writeFile(join(OUT, "page.raw.html"), html);

const cssParts = [];
let i = 0;
for (const [id, header] of sheets) {
  const { text } = await send("CSS.getStyleSheetText", { styleSheetId: id });
  const src = header.isInline ? "inline-style" : header.isConstructed ? "constructed" : header.sourceURL || "unknown";
  const base = src.startsWith("http") ? src.split("/").pop().split("?")[0] : src;
  const name = `${String(i).padStart(3, "0")}-${base.replace(/[^\w.-]/g, "_")}`.replace(/(\.css)?$/, ".css");
  await writeFile(join(OUT, "css", name), text);
  cssParts.push(`/* ===== ${src} (${header.origin}) ===== */\n${text}`);
  i++;
}
const allCss = cssParts.join("\n\n");
await writeFile(join(OUT, "all.css"), allCss);

await writeFile(join(OUT, "snapshot.html"), cleaned.value);

console.log(`HTML: ${html.length} chars, stylesheets: ${sheets.size}, CSS total: ${allCss.length} chars`);
ws.close();
