import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.{ts,tsx}"],
    exclude: ["e2e/**", "node_modules/**"],
    // PGlite database setup can exceed the 10 s default when every DB suite boots in parallel.
    hookTimeout: 60_000,
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
    },
  },
});
