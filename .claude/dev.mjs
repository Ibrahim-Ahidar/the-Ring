// Local-only launcher: this machine's AppData\Local ACL makes @swc/core refuse its
// default native cache, so point it at a folder under the user profile instead.
import { spawn } from "node:child_process";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const PORT = Number(process.env.PORT ?? 3000);

process.env.SWC_NATIVE_BINDING_CACHE = path.join(os.homedir(), ".swc-cache");

// A second `next dev` in this folder shares `.next` with the first one and they
// overwrite each other's chunks: pages load without their JS and forms submit as
// plain HTML. Refuse to start instead of silently picking another port.
function portInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

if (await portInUse(PORT)) {
  console.error(
    `Port ${PORT} is already in use. A dev server is probably already running for this project.\n` +
      `Use that one, or stop it first. Running two shares .next and breaks page JS.`,
  );
  process.exit(1);
}

const child = spawn(`npm run dev -- --port ${PORT}`, {
  stdio: "inherit",
  shell: true,
  env: process.env,
});
child.on("exit", (code) => process.exit(code ?? 0));
