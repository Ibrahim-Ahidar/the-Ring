// Local-only launcher: this machine's AppData\Local ACL makes @swc/core refuse its
// default native cache, so point it at a folder under the user profile instead.
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

process.env.SWC_NATIVE_BINDING_CACHE = path.join(os.homedir(), ".swc-cache");

const child = spawn("npm run dev", { stdio: "inherit", shell: true, env: process.env });
child.on("exit", (code) => process.exit(code ?? 0));
