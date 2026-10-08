import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Env validation runs in instrumentation.ts at dev/start — not here — so build passes without env.
};

export default withNextIntl(nextConfig);
