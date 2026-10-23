import type { CryptoEngine } from "@pulse/core";
import { WorkerCryptoEngine } from "./rpc";

/** Starts the vodozemac worker and returns the RPC proxy. Browser only. */
export function createCryptoEngine(): CryptoEngine {
  const worker = new Worker(new URL("./crypto.worker.ts", import.meta.url), { type: "module" });
  return new WorkerCryptoEngine(worker);
}
