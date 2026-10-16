import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Env validation runs in instrumentation.ts at dev/start — not here — so build passes without env.
  webpack(config, { isServer, dev }) {
    // PULSE_CHUNK_STATS=1 next build → .next/chunk-stats.json (client chunks and their modules).
    if (process.env.PULSE_CHUNK_STATS === "1" && !isServer && !dev) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ChunkStatsPlugin } = require("./scripts/perf/chunk-stats-plugin.cjs");
      config.plugins.push(new ChunkStatsPlugin());
    }
    return config;
  },
};

export default withNextIntl(nextConfig);
