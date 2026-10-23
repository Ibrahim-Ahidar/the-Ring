import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe("mobile timing is dev-only", () => {
  it("only src/timing/index.ts requires the runtime, behind __DEV__", () => {
    const src = join(__dirname, "..");
    const users = walk(src).filter(
      (f) => !/runtime\.ts$/.test(f) && !/\.test\.ts$/.test(f) && /\.\/runtime/.test(readFileSync(f, "utf8")),
    );
    expect(users.map((f) => f.replace(src, "").split(String.fromCharCode(92)).join("/"))).toEqual(["/timing/index.ts"]);
    const index = readFileSync(join(__dirname, "index.ts"), "utf8");
    expect(index).toContain('if (__DEV__) {');
    expect(index).toContain('return require("./runtime")');
    expect(index).not.toMatch(/^import .* from "\.\/runtime"/m);
  });
});
