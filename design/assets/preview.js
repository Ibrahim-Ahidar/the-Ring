// Design-preview only: applies ?theme=&dir=&lang=&accent= and adds a small
// switcher when a screen is opened on its own (not inside the canvas).
(() => {
  const root = document.documentElement;
  const params = new URLSearchParams(location.search);

  const apply = (key, value) => {
    if (!value) return;
    if (key === "dir") {
      root.dir = value;
      root.lang = value === "rtl" ? "ar" : "en";
    } else {
      root.dataset[key] = value;
    }
  };

  for (const key of ["theme", "accent", "dir"]) apply(key, params.get(key));

  if (window.top !== window) return;

  const options = {
    theme: ["system", "light", "dark"],
    dir: ["ltr", "rtl"],
    accent: ["green", "blue", "violet"],
  };

  const bar = document.createElement("div");
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Preview options");
  bar.style.cssText =
    "position:fixed;inset-block-end:12px;inset-inline-start:50%;translate:-50% 0;z-index:999;display:flex;gap:8px;padding:8px;border-radius:999px;background:var(--color-elevated);box-shadow:var(--shadow-menu);font:12px var(--font-sans)";
  if (root.dir === "rtl") bar.style.translate = "50% 0";

  for (const [key, values] of Object.entries(options)) {
    const select = document.createElement("select");
    select.setAttribute("aria-label", key);
    select.style.cssText =
      "height:28px;padding:0 8px;border-radius:999px;border:1px solid var(--color-border);background:var(--color-panel);color:var(--color-text)";
    for (const value of values) select.add(new Option(`${key}: ${value}`, value));
    select.value = key === "dir" ? root.dir || "ltr" : root.dataset[key] || values[0];
    select.addEventListener("change", () => {
      const next = new URLSearchParams(location.search);
      next.set(key, select.value);
      location.search = next.toString();
    });
    bar.append(select);
  }

  const home = document.createElement("a");
  home.href = location.pathname.includes("/screens/") ? "../index.html" : "index.html";
  home.textContent = "All screens";
  home.style.cssText = "display:grid;place-items:center;padding:0 12px;color:var(--color-accent);font-weight:600";
  bar.append(home);

  const close = document.createElement("button");
  close.textContent = "×";
  close.setAttribute("aria-label", "Hide preview options");
  close.style.cssText = "width:28px;height:28px;border-radius:50%;color:var(--color-text-muted);font-size:18px";
  close.addEventListener("click", () => bar.remove());
  bar.append(close);

  addEventListener("DOMContentLoaded", () => document.body.append(bar));
})();
