/// <reference lib="webworker" />
/** Web Worker entry: loads vodozemac WASM and serves the CryptoEngine over postMessage. */
import init, * as vz from "@kinsh/vodozemac-wasm";
import type { CryptoEngine } from "@pulse/core";
import { serveCryptoEngine } from "./rpc";
import { VodozemacEngine, type VodozemacModule } from "./vodozemac-engine";

const ready = init().then(() => new VodozemacEngine(vz as unknown as VodozemacModule));

// Defer every call until the WASM module has initialised.
const engine = new Proxy({} as CryptoEngine, {
  get:
    (_t, prop) =>
    async (...args: unknown[]) => {
      const e = await ready;
      return (e[prop as keyof CryptoEngine] as (...a: unknown[]) => unknown).apply(e, args);
    },
});

serveCryptoEngine(engine, self);
