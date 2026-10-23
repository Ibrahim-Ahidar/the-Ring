/** Loads vodozemac under Node (tests): the package's node build initialises itself. */
import * as vz from "@kinsh/vodozemac-wasm";
import type { VodozemacModule } from "./vodozemac-engine";

export function loadVodozemacNode(): VodozemacModule {
  return vz as unknown as VodozemacModule;
}
