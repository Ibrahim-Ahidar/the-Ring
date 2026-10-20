import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  experimental: {
    // Reuse dynamic pages for 30s on back/forward and revisits instead of refetching.
    staleTimes: { dynamic: 30 },
    optimizePackageImports: ["lucide-react"],
  },
  // Env validation runs in instrumentation.ts at dev/start — not here — so build passes without env.
  webpack(config, { isServer, dev }) {
    // PULSE_CHUNK_STATS=1 next build → .next/chunk-stats.json (client chunks and their modules).
    if (process.env.PULSE_CHUNK_STATS === "1" && !isServer && !dev) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ChunkStatsPlugin } = require("./scripts/perf/chunk-stats-plugin.cjs");
      config.plugins.push(new ChunkStatsPlugin());
    }
    // Next injects a ~200 kB `buffer` polyfill into every client bundle for any module that mentions
    // `Buffer`. Our only client hit is storage-js's `typeof Buffer !== "undefined"` guard, which has a
    // btoa fallback, so drop the injection. Server and edge builds keep the real Buffer.
    if (!isServer) {
      for (const plugin of config.plugins ?? []) {
        const defs = plugin?.constructor?.name === "ProvidePlugin" ? plugin.definitions : undefined;
        if (defs && "Buffer" in defs) {
          delete defs.Buffer;
        }
      }
    }
    return config;
  },
};

export default withNextIntl(nextConfig);
