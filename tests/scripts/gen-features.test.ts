import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

describe("gen-features.mjs", () => {
  it("generates deterministic imports for fixture features", () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-gen-"));
    const outFile = path.join(outDir, "features.ts");
    const fixtureRoot = path.join(projectRoot, "tests/fixtures/gen-features");

    execFileSync(
      process.execPath,
      [
        path.join(projectRoot, "scripts/gen-features.mjs"),
        fixtureRoot,
        "--out",
        outFile,
      ],
      { cwd: projectRoot },
    );

    const content = fs.readFileSync(outFile, "utf8");
    expect(content).toContain("feature: \"alpha\"");
    expect(content).toContain("feature: \"beta\"");
    const alphaIndex = content.indexOf("feature: \"alpha\"");
    const betaIndex = content.indexOf("feature: \"beta\"");
    expect(alphaIndex).toBeLessThan(betaIndex);
    expect(content).toContain("alpha_messages_ar");
    expect(content).toContain("beta_messages_en");
  });

  it("works with zero features", () => {
    const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-empty-"));
    fs.mkdirSync(path.join(emptyRoot, "features"));
    const outFile = path.join(emptyRoot, "out.ts");

    execFileSync(
      process.execPath,
      [
        path.join(projectRoot, "scripts/gen-features.mjs"),
        emptyRoot,
        "--out",
        outFile,
      ],
      { cwd: projectRoot },
    );

    const content = fs.readFileSync(outFile, "utf8");
    expect(content).toContain("export const featureContributions = [");
    expect(content).toContain("] as const;");
    expect(content).not.toContain("import { contributions");
  });
});
