// Start Metro for a phone plugged in over USB: `adb reverse` maps the phone's
// localhost:8081 to this PC, so Wi-Fi, LAN IP and the Windows firewall don't matter.
const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ||
  (process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Android", "Sdk"));
const bundled = sdk && path.join(sdk, "platform-tools", process.platform === "win32" ? "adb.exe" : "adb");
const adb = bundled && fs.existsSync(bundled) ? bundled : "adb";

try {
  execFileSync(adb, ["reverse", "tcp:8081", "tcp:8081"], { stdio: "inherit" });
} catch {
  console.error("adb reverse failed: plug the phone in over USB, turn on USB debugging and accept the prompt on the phone.");
  process.exit(1);
}

spawn("npx", ["expo", "start", "--localhost", ...process.argv.slice(2)], { stdio: "inherit", shell: true })
  .on("exit", (code) => process.exit(code ?? 0));
