import { readFileSync } from "fs";
import { join } from "path";

import { avatarColourIndex, avatarInitials } from "./avatar-helpers";
import { createTheme, darkColors, getColors, lightColors, radii, spacing } from "./theme";

const css = readFileSync(join(__dirname, "../../../web/src/shell/styles/tokens.css"), "utf8");

function webPair(name: string): [string, string] {
  const m = new RegExp(String.raw`--${name}:\s*light-dark\((.+)\);`).exec(css);
  if (!m) throw new Error(`token --${name} not found`);
  const body = m[1]!;
  let depth = 0;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (ch === "," && depth === 0) return [body.slice(0, i).trim(), body.slice(i + 1).trim()];
  }
  throw new Error(`token --${name} has no pair`);
}

const camel = (s: string) => s.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

describe("theme tokens", () => {
  it("light and dark expose the same keys", () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
    expect(Object.keys(getColors("dark", "green")).sort()).toEqual(Object.keys(lightColors).sort());
  });

  it("matches the web light-dark() pairs for every token that has one", () => {
    const names = [
      "color-bg", "color-panel", "color-card", "color-modal", "color-elevated", "color-input",
      "color-hover", "color-selected", "color-pressed", "color-text", "color-text-muted",
      "color-text-disabled", "color-icon", "color-border", "color-border-strong", "color-accent",
      "color-accent-strong", "color-accent-soft", "color-accent-contrast", "color-focus",
      "color-danger", "color-danger-soft", "color-warning", "color-read", "color-link",
      "color-chat-bg", "color-chat-pattern", "color-bubble-in", "color-bubble-out",
      "color-bubble-meta", "color-quote", "color-system", "avatar-1", "avatar-2", "avatar-3",
      "avatar-4", "avatar-5", "avatar-6", "avatar-text", "sender-1", "sender-2", "sender-3", "sender-4",
    ];
    for (const name of names) {
      const [light, dark] = webPair(name);
      const key = camel(name.replace(/^color-/, "")) as keyof typeof lightColors;
      expect([name, lightColors[key]]).toEqual([name, light]);
      expect([name, darkColors[key]]).toEqual([name, dark]);
    }
  });

  it("matches the web scalar tokens", () => {
    expect(css).toContain("--color-online: #25d366");
    expect(lightColors.online).toBe("#25d366");
    expect(css).toContain("--color-overlay: rgba(0, 0, 0, 0.32)");
    expect(lightColors.overlay).toBe("rgba(0, 0, 0, 0.32)");
    expect(radii).toMatchObject({ control: 8, card: 12, pill: 999 });
    expect(spacing).toMatchObject({ s4: 4, s8: 8, s12: 12, s16: 16, s24: 24 });
  });

  it("createTheme resolves mode and accent", () => {
    expect(createTheme("dark").colors.bg).toBe("#121318");
    expect(createTheme("light", "green").colors.accent).toBe("#1daa61");
    expect(createTheme("dark", "green").isDark).toBe(true);
  });
});

describe("avatar helpers", () => {
  it("derives initials like the web", () => {
    expect(avatarInitials("Lina Haddad")).toBe("LH");
    expect(avatarInitials("@lina")).toBe("L");
    expect(avatarInitials("")).toBe("?");
  });
  it("picks a stable color index 0-5", () => {
    expect(avatarColourIndex("user-1")).toBe(avatarColourIndex("user-1"));
    expect(avatarColourIndex("abc")).toBeLessThan(6);
  });
});
