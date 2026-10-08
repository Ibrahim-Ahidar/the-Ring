import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Env validation runs in instrumentation.ts at dev/start — not here — so build passes without env.
};

export default nextConfig;
